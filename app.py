from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import heapq
import math

app = Flask(__name__)
CORS(app)

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '2007',  # Update with your MySQL password if needed
    'database': 'ambulance_db'
}

def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Database Connection Error: {e}")
        return None

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance between two points on earth in kilometers."""
    R = 6371.0  # Earth radius in KM
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def dijkstra(graph, start_node, end_node):
    """Dijkstra shortest path algorithm returning distance and node path."""
    if start_node not in graph or end_node not in graph:
        return float('infinity'), []

    distances = {node: float('infinity') for node in graph}
    distances[start_node] = 0
    pq = [(0, start_node, [start_node])]

    while pq:
        current_dist, current_node, path = heapq.heappop(pq)

        if current_node == end_node:
            return current_dist, path

        if current_dist > distances[current_node]:
            continue

        for neighbor, weight in graph[current_node].items():
            distance = current_dist + weight
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                heapq.heappush(pq, (distance, neighbor, path + [neighbor]))

    return float('infinity'), []

@app.route('/api/system-status', methods=['GET'])
def get_system_status():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Failed to connect to MySQL database'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM locations")
        locations = cursor.fetchall()

        cursor.execute("""
            SELECT a.*, l.name as location_name, l.latitude, l.longitude 
            FROM ambulances a 
            LEFT JOIN locations l ON a.current_location_id = l.location_id
        """)
        ambulances = cursor.fetchall()

        cursor.execute("""
            SELECT h.*, l.latitude, l.longitude 
            FROM hospitals h 
            LEFT JOIN locations l ON LOWER(TRIM(h.location_name)) = LOWER(TRIM(l.name))
        """)
        hospitals = cursor.fetchall()

        cursor.execute("SELECT * FROM road_connections")
        roads = cursor.fetchall()

        return jsonify({
            'locations': locations,
            'ambulances': ambulances,
            'hospitals': hospitals,
            'roads': roads
        })
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            conn.close()

@app.route('/api/dispatch', methods=['POST'])
def dispatch_ambulance():
    data = request.json or {}
    patient_name = data.get('patient_name', 'Emergency Patient')
    phone = data.get('phone', 'N/A')
    user_lat = data.get('user_lat')
    user_lng = data.get('user_lng')
    pickup_location_id = data.get('pickup_location_id')
    severity = data.get('severity', 'Moderate')
    hospital_id = data.get('hospital_id')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Failed to connect to MySQL database'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # 1. Fetch Locations
        cursor.execute("SELECT * FROM locations")
        locations = cursor.fetchall()
        if not locations:
            return jsonify({'error': 'No locations configured in database'}), 400

        # Determine pickup location
        if user_lat is not None and user_lng is not None:
            try:
                u_lat, u_lng = float(user_lat), float(user_lng)
                closest_loc = min(
                    locations,
                    key=lambda l: haversine_distance(u_lat, u_lng, float(l['latitude']), float(l['longitude']))
                )
                pickup_location_id = closest_loc['location_id']
            except (ValueError, KeyError):
                pickup_location_id = locations[0]['location_id']
        elif pickup_location_id:
            pickup_location_id = int(pickup_location_id)
        else:
            pickup_location_id = locations[0]['location_id']

        # 2. Build Road Graph
        cursor.execute("SELECT source_location_id, target_location_id, distance_km, traffic_multiplier FROM road_connections")
        connections = cursor.fetchall()

        graph = {loc['location_id']: {} for loc in locations}
        for conn_row in connections:
            u = conn_row['source_location_id']
            v = conn_row['target_location_id']
            dist = float(conn_row['distance_km'])
            traffic = float(conn_row.get('traffic_multiplier', 1.0))
            w = dist * traffic

            if u in graph: graph[u][v] = w
            if v in graph: graph[v][u] = w

        # 3. Fetch Hospitals with robust matching
        cursor.execute("""
            SELECT h.*, COALESCE(l.location_id, 1) AS location_id 
            FROM hospitals h 
            LEFT JOIN locations l ON LOWER(TRIM(h.location_name)) = LOWER(TRIM(l.name))
        """)
        hospitals = cursor.fetchall()

        if not hospitals:
            cursor.execute("SELECT *, 1 as location_id FROM hospitals")
            hospitals = cursor.fetchall()

        if not hospitals:
            return jsonify({'error': 'No hospitals configured in database'}), 400

        # Hospital Selection Algorithm
        if not hospital_id or str(hospital_id) == 'auto':
            if severity == 'Critical':
                suitable_hospitals = [h for h in hospitals if h.get('icu_beds_available', 1) > 0]
            else:
                suitable_hospitals = hospitals

            if not suitable_hospitals:
                suitable_hospitals = hospitals

            best_hosp = None
            min_hosp_dist = float('infinity')
            for hosp in suitable_hospitals:
                hosp_node = hosp['location_id']
                dist, _ = dijkstra(graph, pickup_location_id, hosp_node)
                if dist < min_hosp_dist:
                    min_hosp_dist = dist
                    best_hosp = hosp

            selected_hospital = best_hosp if best_hosp else hospitals[0]
            hospital_id = selected_hospital['hospital_id']
        else:
            hospital_id = int(hospital_id)
            selected_hospital = next((h for h in hospitals if h['hospital_id'] == hospital_id), hospitals[0])

        # 4. Find Closest Available Ambulance
        cursor.execute("SELECT * FROM ambulances WHERE status = 'AVAILABLE'")
        available_ambulances = cursor.fetchall()

        if not available_ambulances:
            return jsonify({'error': 'No available ambulances in the system right now!'}), 400

        best_ambulance = None
        min_time = float('infinity')
        best_path = []

        for amb in available_ambulances:
            amb_loc = amb['current_location_id']
            dist, path = dijkstra(graph, amb_loc, pickup_location_id)
            if dist < min_time:
                min_time = dist
                best_ambulance = amb
                best_path = path

        if not best_ambulance or min_time == float('infinity'):
            return jsonify({'error': 'No reachable ambulance route found for this location'}), 400

        # 5. Insert records and update status
        cursor.execute("INSERT INTO patients (name, phone) VALUES (%s, %s)", (patient_name, phone))
        patient_id = cursor.lastrowid

        cursor.execute("UPDATE ambulances SET status = 'DISPATCHED' WHERE ambulance_id = %s", (best_ambulance['ambulance_id'],))

        est_time_mins = round((min_time / 50.0) * 60, 2)
        if est_time_mins < 1.0:
            est_time_mins = 2.0

        cursor.execute("""
            INSERT INTO emergency_dispatches (patient_id, ambulance_id, pickup_location_id, hospital_id, estimated_time_mins)
            VALUES (%s, %s, %s, %s, %s)
        """, (patient_id, best_ambulance['ambulance_id'], pickup_location_id, hospital_id, est_time_mins))

        conn.commit()

        pickup_name = next((l['name'] for l in locations if l['location_id'] == pickup_location_id), 'GPS Location')

        return jsonify({
            'message': 'Ambulance dispatched successfully!',
            'ambulance_id': best_ambulance['vehicle_number'],
            'assigned_hospital': selected_hospital['name'],
            'pickup_location': pickup_name,
            'route_path': best_path,
            'estimated_time_mins': est_time_mins
        })

    except Error as e:
        print(f"Server Error: {e}")
        return jsonify({'error': f"Database Error: {str(e)}"}), 500
    finally:
        if conn.is_connected():
            conn.close()

@app.route('/api/admin/dispatches', methods=['GET'])
def get_all_dispatches():
    conn = get_db_connection()
    if not conn:
        return jsonify([]), 500

    try:
        cursor = conn.cursor(dictionary=True)
        query = """
        SELECT 
            d.dispatch_id, p.name AS patient_name, p.phone,
            a.vehicle_number, l.name AS pickup_location,
            h.name AS hospital_name, d.status, d.estimated_time_mins, d.created_at
        FROM emergency_dispatches d
        JOIN patients p ON d.patient_id = p.patient_id
        JOIN ambulances a ON d.ambulance_id = a.ambulance_id
        JOIN locations l ON d.pickup_location_id = l.location_id
        JOIN hospitals h ON d.hospital_id = h.hospital_id
        ORDER BY d.created_at DESC
        """
        cursor.execute(query)
        logs = cursor.fetchall()
        return jsonify(logs)
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            conn.close()

@app.route('/api/admin/ambulance/status', methods=['POST'])
def update_ambulance_status():
    data = request.json or {}
    amb_id = data.get('ambulance_id')
    new_status = data.get('status')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Failed to connect to MySQL database'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE ambulances SET status = %s WHERE ambulance_id = %s", (new_status, amb_id))
        conn.commit()
        return jsonify({'message': 'Ambulance status updated successfully'})
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn.is_connected():
            conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)