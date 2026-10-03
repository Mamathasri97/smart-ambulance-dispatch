import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Activity, ShieldAlert, Truck, Navigation, List, RefreshCw } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const API_BASE = 'http://127.0.0.1:5000/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('user');
  const [systemData, setSystemData] = useState({ locations: [], ambulances: [], hospitals: [], roads: [] });
  const [dispatchLogs, setDispatchLogs] = useState([]);
  
  // Form States
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [pickupLoc, setPickupLoc] = useState('');
  const [severity, setSeverity] = useState('Moderate');
  const [hospitalMode, setHospitalMode] = useState('auto');
  const [hospital, setHospital] = useState('auto');
  const [dispatchResult, setDispatchResult] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('');

  useEffect(() => {
    fetchSystemStatus();
    fetchLogs();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/system-status`);
      setSystemData(res.data);
      if (res.data.locations && res.data.locations.length > 0) {
        setPickupLoc(res.data.locations[0].location_id);
      }
    } catch (err) {
      console.error("Error fetching system status:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/dispatches`);
      setDispatchLogs(res.data);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation is not supported by your browser.');
      return;
    }
    setGpsStatus('Detecting location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUseGps(true);
        setGpsStatus('📍 Location detected successfully!');
      },
      (err) => {
        setGpsStatus(`Error: ${err.message}`);
      }
    );
  };

  const handleDispatch = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        patient_name: patientName,
        phone: phone,
        severity: severity,
        hospital_id: hospitalMode === 'auto' ? 'auto' : hospital
      };

      if (useGps && gpsCoords) {
        payload.user_lat = gpsCoords.lat;
        payload.user_lng = gpsCoords.lng;
      } else {
        payload.pickup_location_id = pickupLoc;
      }

      const res = await axios.post(`${API_BASE}/dispatch`, payload);
      setDispatchResult({ success: true, data: res.data });
      fetchSystemStatus();
      fetchLogs();
    } catch (err) {
      setDispatchResult({ success: false, error: err.response?.data?.error || 'Dispatch Failed' });
    }
  };

  const updateAmbulanceStatus = async (ambId, newStatus) => {
    await axios.post(`${API_BASE}/admin/ambulance/status`, { ambulance_id: ambId, status: newStatus });
    fetchSystemStatus();
  };

  const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: '14px',
    boxSizing: 'border-box'
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f3f4f6', minHeight: '100vh', color: '#1f2937' }}>
      {/* Header Navigation */}
      <nav style={{ background: '#1e293b', color: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 'bold' }}>
          <ShieldAlert color="#ef4444" size={28} /> Smart EMS Control Center
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            onClick={() => setActiveTab('user')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'user' ? '#ef4444' : '#334155', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
            Dispatch Portal
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'admin' ? '#ef4444' : '#334155', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
            Admin Control Center
          </button>
        </div>
      </nav>

      {/* Main Body */}
      <div style={{ padding: '30px', maxWidth: '1300px', margin: '0 auto' }}>
        {activeTab === 'user' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '25px' }}>
            
            {/* Form */}
            <div style={{ background: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <h2 style={{ marginTop: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity color="#ef4444" /> Emergency Dispatch
              </h2>

              <form onSubmit={handleDispatch}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>Patient Name</label>
                  <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)} required style={inputStyle} placeholder="Enter full name" />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>Phone Number</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required style={inputStyle} placeholder="Enter contact number" />
                </div>

                {/* GPS Location Option */}
                <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Pickup Location</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button type="button" onClick={handleGetLocation} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #2563eb', background: useGps ? '#2563eb' : '#eff6ff', color: useGps ? '#ffffff' : '#2563eb', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Navigation size={16} /> Use Live GPS
                    </button>
                    <button type="button" onClick={() => setUseGps(false)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #6b7280', background: !useGps ? '#4b5563' : '#f3f4f6', color: !useGps ? '#ffffff' : '#374151', fontWeight: '600', cursor: 'pointer' }}>
                      Select Manual
                    </button>
                  </div>
                  {gpsStatus && <p style={{ fontSize: '12px', color: '#2563eb', margin: '4px 0 0 0' }}>{gpsStatus}</p>}

                  {!useGps && (
                    <select value={pickupLoc} onChange={e => setPickupLoc(e.target.value)} style={{ ...inputStyle, marginTop: '8px' }}>
                      {systemData.locations.map(l => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                    </select>
                  )}
                </div>

                {/* Severity Selection */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>Emergency Severity Level</label>
                  <select value={severity} onChange={e => setSeverity(e.target.value)} style={inputStyle}>
                    <option value="Critical">🔴 Critical (Requires ICU/Trauma Support)</option>
                    <option value="Moderate">🟡 Moderate (General Emergency)</option>
                    <option value="Low">🟢 Low (Basic Transport)</option>
                  </select>
                </div>

                {/* Destination Selection */}
                <div style={{ marginBottom: '18px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Destination Hospital Selection</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <button type="button" onClick={() => { setHospitalMode('auto'); setHospital('auto'); }} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #16a34a', background: hospitalMode === 'auto' ? '#16a34a' : '#f0fdf4', color: hospitalMode === 'auto' ? '#ffffff' : '#16a34a', fontWeight: '600', cursor: 'pointer' }}>
                      ⚡ Auto-Recommend
                    </button>
                    <button type="button" onClick={() => setHospitalMode('manual')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #6b7280', background: hospitalMode === 'manual' ? '#4b5563' : '#f3f4f6', color: hospitalMode === 'manual' ? '#ffffff' : '#374151', fontWeight: '600', cursor: 'pointer' }}>
                      Choose Manually
                    </button>
                  </div>

                  {hospitalMode === 'manual' && (
                    <select value={hospital} onChange={e => setHospital(e.target.value)} style={inputStyle}>
                      {systemData.hospitals.map(h => <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>)}
                    </select>
                  )}
                </div>

                <button type="submit" style={{ width: '100%', background: '#ef4444', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
                  Run Dijkstra & Dispatch
                </button>
              </form>

              {/* Result Notification */}
              {dispatchResult && (
                <div style={{ marginTop: '20px', padding: '15px', borderRadius: '8px', background: dispatchResult.success ? '#ecfdf5' : '#fef2f2', border: `1px solid ${dispatchResult.success ? '#10b981' : '#f87171'}` }}>
                  {dispatchResult.success ? (
                    <>
                      <h4 style={{ margin: '0 0 8px 0', color: '#065f46', fontSize: '16px' }}>✅ Ambulance Dispatched Successfully!</h4>
                      <p style={{ margin: '4px 0', color: '#047857' }}><strong>Assigned Vehicle:</strong> {dispatchResult.data.ambulance_id}</p>
                      <p style={{ margin: '4px 0', color: '#047857' }}><strong>Pickup Location:</strong> {dispatchResult.data.pickup_location}</p>
                      <p style={{ margin: '4px 0', color: '#047857' }}><strong>Assigned Hospital:</strong> {dispatchResult.data.assigned_hospital}</p>
                      <p style={{ margin: '4px 0', color: '#047857' }}><strong>Estimated Travel Time:</strong> {dispatchResult.data.estimated_time_mins} mins</p>
                    </>
                  ) : (
                    <p style={{ color: '#991b1b', margin: 0, fontWeight: 'bold' }}>❌ {dispatchResult.error}</p>
                  )}
                </div>
              )}
            </div>

            {/* Map */}
            <div style={{ background: '#ffffff', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', height: '580px' }}>
              <MapContainer center={[17.3850, 78.4867]} zoom={12} style={{ height: '100%', width: '100%', borderRadius: '8px' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {systemData.locations.map(loc => (
                  <Marker key={loc.location_id} position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}>
                    <Popup><strong>{loc.name}</strong><br />Node ID: {loc.location_id}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

          </div>
        ) : (
          /* Admin Panel */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ background: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <h3 style={{ marginTop: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck color="#3b82f6" /> Active Ambulance Fleet Management
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                {systemData.ambulances.map(amb => (
                  <div key={amb.ambulance_id} style={{ border: '1px solid #e5e7eb', padding: '15px', borderRadius: '8px', background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span style={{ color: '#111827' }}>{amb.vehicle_number} ({amb.type})</span>
                      <span style={{ color: amb.status === 'AVAILABLE' ? '#10b981' : '#ef4444' }}>{amb.status}</span>
                    </div>
                    <p style={{ fontSize: '14px', color: '#4b5563', margin: '8px 0' }}>Location: {amb.location_name}</p>
                    <select 
                      value={amb.status} 
                      onChange={(e) => updateAmbulanceStatus(amb.ambulance_id, e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', width: '100%', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}>
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="DISPATCHED">DISPATCHED</option>
                      <option value="BUSY">BUSY</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <List color="#10b981" /> System Emergency Dispatch Logs
                </h3>
                <button onClick={fetchLogs} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: 'none', background: '#e5e5e5', color: '#1f2937', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <RefreshCw size={16} /> Refresh Logs
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#1f2937' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '12px' }}>ID</th>
                    <th style={{ padding: '12px' }}>Patient</th>
                    <th style={{ padding: '12px' }}>Vehicle</th>
                    <th style={{ padding: '12px' }}>Pickup Location</th>
                    <th style={{ padding: '12px' }}>Hospital</th>
                    <th style={{ padding: '12px' }}>ETA</th>
                    <th style={{ padding: '12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLogs.map(log => (
                    <tr key={log.dispatch_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px' }}>#{log.dispatch_id}</td>
                      <td style={{ padding: '12px' }}>{log.patient_name} ({log.phone})</td>
                      <td style={{ padding: '12px' }}>{log.vehicle_number}</td>
                      <td style={{ padding: '12px' }}>{log.pickup_location}</td>
                      <td style={{ padding: '12px' }}>{log.hospital_name}</td>
                      <td style={{ padding: '12px' }}>{log.estimated_time_mins} mins</td>
                      <td style={{ padding: '12px' }}><span style={{ padding: '4px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: 'bold' }}>{log.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}