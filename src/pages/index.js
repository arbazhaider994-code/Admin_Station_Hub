import Head from "next/head";
import React, { useState, useEffect } from "react";
import styles from "@/styles/Admin.module.css";
import dashboardStyles from "@/styles/Dashboard.module.css";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";

export default function Home() {
  // State to track if the admin is logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Stations state
  const [stations, setStations] = useState([]);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStation, setNewStation] = useState({ name: '', address: '', city: '', phone: '', email: '', status: 'Active', description: 'Write something about station' });
  const [stationImages, setStationImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [editingStationId, setEditingStationId] = useState(null);
  const [editStation, setEditStation] = useState({ name: '', address: '', city: '', phone: '', email: '', status: 'Active', description: 'Write something about station' });
  const [showServiceFormFor, setShowServiceFormFor] = useState(null);
  const [newQuickService, setNewQuickService] = useState({ name: '', price: '', description: 'write something about this service' });
  const [successMessage, setSuccessMessage] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingServices, setPendingServices] = useState([]);
  const [tempService, setTempService] = useState({ name: '', price: '', description: 'write something about this service' });
  const removeExistingImage = (index) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
  };
  // State for login form data
  const [formData, setFormData] = useState({ email: '', password: '' });

  // ... (auth and sync logic) ...


  // Check authentication status on load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
      setIsCheckingAuth(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showUserDropdown) return;
    const closeDropdown = () => setShowUserDropdown(false);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [showUserDropdown]);

  // Fetch real-time data from Firestore when logged in
  useEffect(() => {
    if (!isLoggedIn) return;

    // Listen to Services
    const qServices = query(collection(db, "services"));
    const unsubServices = onSnapshot(qServices, (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Fetched ${servicesData.length} services`);
      setServices(servicesData);
    }, (error) => {
      console.error("Firestore Services Error:", error);
      if (error.code === 'permission-denied') {
        alert("Permission denied reading Services. Check your Firestore Security Rules.");
      }
    });

    // Listen to Bookings
    const qBookings = query(collection(db, "bookings"), orderBy("dateTime", "desc"));
    const unsubBookings = onSnapshot(qBookings, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Fetched ${bookingsData.length} bookings`);
      setBookings(bookingsData);
    }, (error) => {
      console.error("Firestore Bookings Error:", error);
    });

    // Listen to Stations
    const qStations = query(collection(db, "stations"));
    const unsubStations = onSnapshot(qStations, (snapshot) => {
      const stationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Fetched ${stationsData.length} stations`);
      setStations(stationsData);
    }, (error) => {
      console.error("Firestore Stations Error:", error);
      if (error.code === 'permission-denied') {
        alert("Permission denied reading Stations. Check your Firestore Security Rules.");
      }
    });

    return () => {
      unsubServices();
      unsubBookings();
      unsubStations();
    };
  }, [isLoggedIn]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      // setIsLoggedIn(true) is handled by onAuthStateChanged
    }
    catch (error) {
      console.log(error.code);

      if (error.code === "auth/user-not-found") {
        setErrorMsg("Email is incorrect");
      }
      else if (error.code === "auth/wrong-password") {
        setErrorMsg("Password is incorrect");
      }
      else if (error.code === "auth/invalid-credential") {
        setErrorMsg("Email or password is incorrect");
      }
      else {
        setErrorMsg("Login failed");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // setIsLoggedIn(false) is handled by onAuthStateChanged
      setFormData({ email: '', password: '' });
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // --- Station Handlers ---
  const handleAddStation = async (e) => {
    e.preventDefault();

    // OPTIMISTIC HIDE: Close form instantly
    setShowAddStation(false);
    setEditingStationId(null);

    try {
      // 1. Upload images to Cloudinary
      const uploadToCloudinary = async (files) => {
        const uploads = Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", "station_upload");

          const res = await fetch(
            "https://api.cloudinary.com/v1_1/dmyl1ftar/image/upload",
            {
              method: "POST",
              body: formData,
            }
          );

          const data = await res.json();
          console.log("Cloudinary response:", data);

          if (!res.ok) {
            throw new Error(data.error?.message || "Upload failed");
          }
          return data.secure_url;
        });
        return await Promise.all(uploads);
      };

      const imageUrls = await uploadToCloudinary(stationImages);

      // 2. Save station in Firestore
      const stationToAdd = {
        name: newStation.name,
        address: newStation.address,
        city: newStation.city,
        phone: newStation.phone,
        email: newStation.email,
        status: newStation.status,
        description: newStation.description,
        images: imageUrls?.filter(Boolean) || [],
        createdAt: serverTimestamp(),
      };

      const stationRef = await addDoc(collection(db, "stations"), stationToAdd);

      // 3. Save pending services
      if (pendingServices.length > 0) {
        const servicesPromises = pendingServices.map((service) =>
          addDoc(collection(db, "services"), {
            ...service,
            stationId: stationRef.id,
            stationName: newStation.name,
            createdAt: serverTimestamp(),
          })
        );
        await Promise.all(servicesPromises);
      }

      // 4. Reset state
      setNewStation({
        name: "",
        address: "",
        city: "",
        phone: "",
        email: "",
        status: "Active",
      });

      setStationImages([]); // IMPORTANT reset images
      setPendingServices([]);

      setSuccessMessage(`Station ${newStation.name} registered successfully!`);
      setTimeout(() => setSuccessMessage(""), 3000);

      setActiveTab("stations");
    } catch (error) {
      console.error("Error adding station:", error);

      setShowAddStation(true); // Re-open on failure
      alert("Failed to save station: " + error.message);
      console.log("Uploaded Image URLs:", imageUrls);
    }
  };

  const addPendingService = () => {
    if (!tempService.name || !tempService.price) {
      alert("Please enter service name and price");
      return;
    }
    setPendingServices([...pendingServices, { ...tempService, price: parseFloat(tempService.price) }]);
    setTempService({ name: '', price: '', description: 'write something about this service' });
  };

  const removePendingService = (index) => {
    setPendingServices(pendingServices.filter((_, i) => i !== index));
  };


  const handleAddServiceToStation = async (e, stationId, stationName) => {
    e.preventDefault();
    const price = parseFloat(String(newQuickService.price).replace(/[^0-9.]/g, ''));

    if (!newQuickService.name || isNaN(price)) {
      alert("Please enter a valid service name and numeric price.");
      return;
    }

    // OPTIMISTIC HIDE & RESET: Clear fields and close form instantly
    setShowServiceFormFor(null);
    setNewQuickService({ name: '', price: '', description: 'write something about this service' });

    try {
      await addDoc(collection(db, "services"), {
        name: newQuickService.name.trim(),
        price: price,
        description: newQuickService.description || "write something about this service",
        status: 'Active',
        stationId: stationId,
        stationName: stationName,
        createdAt: serverTimestamp()
      });

      setSuccessMessage(`Service added to ${stationName}`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error adding service:", error);
      // Re-open on failure and restore data (optional, but here we just alert)
      setShowServiceFormFor(stationId);
      alert("Failed to add service: " + error.message);
    }
  };

  const handleStartEditStation = (station) => {
    setEditingStationId(station.id);
    setEditStation({
      name: station.name || '',
      address: station.address || '',
      city: station.city || '',
      phone: station.phone || '',
      email: station.email || '',
      status: station.status || 'Active',
      description: station.description || 'Write something about station'
    });
    setShowAddStation(false);
    setNewImages([]);
    setExistingImages(station.images || []);
  };

  const handleSaveEditStation = async (e) => {
    e.preventDefault();

    try {
      // Upload new images
      const uploadToCloudinary = async (files) => {
        const uploads = files.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", "station_upload");

          const res = await fetch("https://api.cloudinary.com/v1_1/dmyl1ftar/image/upload", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          return data.secure_url;
        });

        return Promise.all(uploads);
      };

      const uploadedImages = await uploadToCloudinary(newImages);

      const finalImages = [...existingImages, ...uploadedImages];

      await updateDoc(doc(db, "stations", editingStationId), {
        ...editStation,
        images: finalImages
      });

      setEditingStationId(null);
      alert("Station updated successfully!");

    } catch (error) {
      console.error(error);
      alert("Update failed: " + error.message);
    }
  };

  const handleDeleteStation = async (stationId) => {
    if (!window.confirm("Are you sure? This will also remove all services linked to this station.")) return;
    try {
      // Delete station
      await deleteDoc(doc(db, "stations", stationId));

      // Delete linked services
      const linkedServices = services.filter(s => s.stationId === stationId);
      for (const s of linkedServices) {
        await deleteDoc(doc(db, "services", s.id));
      }
    } catch (error) {
      console.error("Error deleting station:", error);
    }
  };

  // Prevent flash of login screen while checking auth
  if (isCheckingAuth) return null;

  // If the admin is logged in, show the Dashboard
  if (isLoggedIn) {
    return (
      <>
        <Head>
          <title>StationHub | Admin Dashboard</title>
          <meta name="description" content="Manage your station hub" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>
        <main className={dashboardStyles.dashboardLayout}>
          {/* Mobile Overlay */}
          {isMobileMenuOpen && (
            <div
              className={dashboardStyles.mobileOverlay}
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside className={`${dashboardStyles.sidebar} ${isSidebarCollapsed ? dashboardStyles.sidebarCollapsed : ''} ${isMobileMenuOpen ? dashboardStyles.sidebarMobileOpen : ''}`}>
            <div className={dashboardStyles.sidebarHeader}>
              <div className={dashboardStyles.sidebarLogo}>
                <div className={dashboardStyles.logoIcon}>S</div>
                {!isSidebarCollapsed && <span className={dashboardStyles.logoText}>StationHub</span>}
              </div>
              <button
                className={dashboardStyles.toggleBtn}
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </button>
            </div>

            <nav className={dashboardStyles.sidebarNav}>
              <button
                className={`${dashboardStyles.sidebarTab} ${activeTab === 'overview' ? dashboardStyles.activeSidebarTab : ''}`}
                onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}
                title="Overview"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                {!isSidebarCollapsed && <span>Overview</span>}
              </button>
              <button
                className={`${dashboardStyles.sidebarTab} ${activeTab === 'stations' ? dashboardStyles.activeSidebarTab : ''}`}
                onClick={() => { setActiveTab('stations'); setIsMobileMenuOpen(false); }}
                title="All Stations"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                {!isSidebarCollapsed && <span>All Stations</span>}
              </button>
              <button
                className={`${dashboardStyles.sidebarTab} ${activeTab === 'add-station' ? dashboardStyles.activeSidebarTab : ''}`}
                onClick={() => { setActiveTab('add-station'); setIsMobileMenuOpen(false); }}
                title="Add Station"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                {!isSidebarCollapsed && <span>Add Station</span>}
              </button>
              <button
                className={`${dashboardStyles.sidebarTab} ${activeTab === 'bookings' ? dashboardStyles.activeSidebarTab : ''}`}
                onClick={() => { setActiveTab('bookings'); setIsMobileMenuOpen(false); }}
                title="Bookings"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                {!isSidebarCollapsed && <span>Bookings</span>}
              </button>
            </nav>

          </aside>

          {/* Main Content */}
          <div className={`${dashboardStyles.mainContent} ${isSidebarCollapsed ? dashboardStyles.mainContentExpanded : ''}`}>
            {/* Top Bar / Header */}
            <header className={dashboardStyles.topBar}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button
                    className={dashboardStyles.mobileMenuBtn}
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="3" y1="12" x2="21" y2="12"></line>
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                  </button>

                  <div className={dashboardStyles.mobileLogo}>
                    <div className={dashboardStyles.logoIcon}>S</div>
                    <span className={dashboardStyles.logoText}>StationHub</span>
                  </div>

                  <h1 className={dashboardStyles.pageTitle}>
                    {activeTab === 'add-station' ? 'Register Station' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </h1>
                </div>

                {/* User Menu & Avatar */}
                <div className={dashboardStyles.userMenu}>
                  <div
                    className={dashboardStyles.avatar}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserDropdown(!showUserDropdown);
                    }}
                  >
                    {auth.currentUser?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>

                  {showUserDropdown && (
                    <div className={dashboardStyles.dropdown}>
                      <div className={dashboardStyles.dropdownInfo}>
                        <span className={dashboardStyles.dropdownEmail} title={auth.currentUser?.email}>
                          {auth.currentUser?.email || 'admin@stationhub.com'}
                        </span>
                      </div>
                      <button onClick={handleLogout} className={dashboardStyles.dropdownItem}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Logout Account
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile Dropdown Menu */}
                {isMobileMenuOpen && (
                  <div className={dashboardStyles.mobileDropdown}>
                    <button className={`${dashboardStyles.dropdownNavTab} ${activeTab === 'overview' ? dashboardStyles.activeDropdownTab : ''}`} onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}>Overview</button>
                    <button className={`${dashboardStyles.dropdownNavTab} ${activeTab === 'stations' ? dashboardStyles.activeDropdownTab : ''}`} onClick={() => { setActiveTab('stations'); setIsMobileMenuOpen(false); }}>All Stations</button>
                    <button className={`${dashboardStyles.dropdownNavTab} ${activeTab === 'add-station' ? dashboardStyles.activeDropdownTab : ''}`} onClick={() => { setActiveTab('add-station'); setIsMobileMenuOpen(false); }}>Add Station</button>
                    <button className={`${dashboardStyles.dropdownNavTab} ${activeTab === 'bookings' ? dashboardStyles.activeDropdownTab : ''}`} onClick={() => { setActiveTab('bookings'); setIsMobileMenuOpen(false); }}>Bookings</button>
                  </div>
                )}

                {successMessage && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    marginTop: '8px',
                    backgroundColor: '#D1FAE5',
                    color: '#065F46',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: '600',
                    border: '1px solid #10B981',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    animation: 'fadeIn 0.3s ease-out',
                    zIndex: 10
                  }}>
                    <span style={{ marginRight: '6px' }}>✓</span> {successMessage}
                  </div>
                )}
              </div>
            </header>

            <div className={dashboardStyles.dashboardContainer}>

              {activeTab === 'overview' && (
                <div className={dashboardStyles.scrollableContent}>
                  <div className={dashboardStyles.statsGrid}>
                    <div className={dashboardStyles.statCard}>
                      <h3 className={dashboardStyles.statTitle}>Registered Stations</h3>
                      <p className={dashboardStyles.statValue}>{stations.length}</p>
                    </div>

                    <div className={dashboardStyles.statCard}>
                      <h3 className={dashboardStyles.statTitle}>Total Bookings</h3>
                      <p className={dashboardStyles.statValue}>{bookings.length}</p>
                    </div>
                  </div>

                  <div className={dashboardStyles.tableContainer} style={{ marginTop: '32px' }}>
                    <h3 className={dashboardStyles.addFormTitle}>Stations & Services Summary</h3>
                    <div className={dashboardStyles.tableWrapper}>
                      <table className={`${dashboardStyles.table} ${dashboardStyles.summaryTable}`}>
                        <thead>
                          <tr>
                            <th>Station Name</th>
                            <th>Provided Services</th>
                            <th>Location</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stations.map(station => {
                            const serviceCount = services.filter(s => s.stationId === station.id).length;
                            return (
                              <tr key={station.id}>
                                <td><strong>{station.name}</strong></td>
                                <td>{serviceCount} {serviceCount === 1 ? 'Service' : 'Services'}</td>
                                <td>{station.city}</td>
                                <td>
                                  <span className={`${dashboardStyles.statusBadge} ${station.status === 'Active' ? dashboardStyles.statusActive : dashboardStyles.statusPending}`}>
                                    {station.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {stations.length === 0 && (
                            <tr>
                              <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No stations registered yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'stations' && (
                <div className={dashboardStyles.tabScrollArea}>
                  {/* Stations Table */}
                  <div className={dashboardStyles.tableContainer}>
                    <div className={dashboardStyles.tableWrapper}>
                      <table className={`${dashboardStyles.table} ${dashboardStyles.mainTable}`}>
                        <thead>
                          <tr>
                            <th>Station Name</th>
                            <th>City</th>
                            <th>Address</th>
                            <th>Contact</th>
                            <th>Status</th>
                            <th>Actions</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stations.length > 0 ? stations.map((station) => (
                            <React.Fragment key={station.id}>
                              {editingStationId === station.id ? (
                                <tr>
                                  <td colSpan="6">
                                    <form onSubmit={handleSaveEditStation} className={dashboardStyles.addForm} style={{ margin: 0 }}>
                                      <h3 className={dashboardStyles.addFormTitle}>Edit Station</h3>
                                      <div className={dashboardStyles.addFormGrid}>
                                        <div className={dashboardStyles.addFormGroup}>
                                          <label className={dashboardStyles.addFormLabel}>Station Name *</label>
                                          <input type="text" className={dashboardStyles.addFormInput} value={editStation.name} onChange={(e) => setEditStation({ ...editStation, name: e.target.value })} required />
                                        </div>
                                        <div className={dashboardStyles.addFormGroup}>
                                          <label className={dashboardStyles.addFormLabel}>City *</label>
                                          <input type="text" className={dashboardStyles.addFormInput} value={editStation.city} onChange={(e) => setEditStation({ ...editStation, city: e.target.value })} required />
                                        </div>

                                        <div className={dashboardStyles.addFormGroup}>
                                          <label className={dashboardStyles.addFormLabel}>Phone *</label>
                                          <input type="tel" className={dashboardStyles.addFormInput} value={editStation.phone} onChange={(e) => setEditStation({ ...editStation, phone: e.target.value })} required />
                                        </div>
                                        <div className={dashboardStyles.addFormGroup}>
                                          <label className={dashboardStyles.addFormLabel}>Email</label>
                                          <input type="email" className={dashboardStyles.addFormInput} value={editStation.email} onChange={(e) => setEditStation({ ...editStation, email: e.target.value })} />
                                        </div>
                                        <div className={dashboardStyles.addFormGroup}>
                                          <label className={dashboardStyles.addFormLabel}>Status</label>
                                          <select className={dashboardStyles.addFormInput} value={editStation.status} onChange={(e) => setEditStation({ ...editStation, status: e.target.value })}>
                                            <option value="Active">Active</option>
                                            <option value="Inactive">Inactive</option>
                                          </select>
                                        </div>
                                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1 / -1' }}>
                                          <label className={dashboardStyles.addFormLabel}>Full Address *</label>
                                          <input type="text" className={dashboardStyles.addFormInput} value={editStation.address} onChange={(e) => setEditStation({ ...editStation, address: e.target.value })} required />
                                        </div>
                                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1 / -1' }}>
                                          <label className={dashboardStyles.addFormLabel}>Description *</label>
                                          <textarea className={dashboardStyles.addFormInput} value={editStation.description} onChange={(e) => setEditStation({ ...editStation, description: e.target.value })} required></textarea>
                                        </div>
                                        {/* Existing Images */}
                                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1 / -1' }}>
                                          <label className={dashboardStyles.addFormLabel}>Existing Images</label>
                                        </div>
                                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                                          {existingImages.length > 0 ? (
                                            existingImages.map((img, index) => (
                                              <div key={index} style={{ position: "relative" }}>
                                                <img
                                                  src={img}
                                                  alt="station"
                                                  style={{
                                                    width: "90px",
                                                    height: "90px",
                                                    objectFit: "cover",
                                                    borderRadius: "8px",
                                                    border: "1px solid #ddd"
                                                  }}
                                                />

                                                <button
                                                  type="button"
                                                  onClick={() => removeExistingImage(index)}
                                                  style={{
                                                    position: "absolute",
                                                    top: "-6px",
                                                    right: "-6px",
                                                    background: "red",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "50%",
                                                    width: "20px",
                                                    height: "20px",
                                                    cursor: "pointer"
                                                  }}
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            ))
                                          ) : (
                                            <p style={{ fontSize: "12px", color: "#9CA3AF" }}>No images available</p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Upload New Images */}
                                      <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1 / -1' }}>
                                        <label className={dashboardStyles.addFormLabel}>Upload New Images</label>

                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          className={dashboardStyles.addFormInput}
                                          onChange={(e) => setNewImages(Array.from(e.target.files))}
                                        />

                                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                                          {newImages.map((file, index) => (
                                            <img
                                              key={index}
                                              src={URL.createObjectURL(file)}
                                              alt="new"
                                              style={{
                                                width: "90px",
                                                height: "90px",
                                                objectFit: "cover",
                                                borderRadius: "8px",
                                                border: "1px solid #ddd"
                                              }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                        <button type="submit" className={dashboardStyles.addButton}>Save Changes</button>
                                        <button type="button" className={dashboardStyles.cancelButton} onClick={() => setEditingStationId(null)}>Cancel</button>
                                      </div>
                                    </form>
                                  </td>
                                </tr>
                              ) : (
                                <tr>
                                  <td>
                                    <strong>{station.name || 'N/A'}</strong>
                                    <ul className={dashboardStyles.nestedServiceList}>
                                      {services.filter(s => s.stationId === station.id).map(s => (
                                        <li key={s.id} className={dashboardStyles.nestedServiceTag}>
                                          {s.name} - ${s.price} - {s.description}
                                        </li>
                                      ))}
                                      {services.filter(s => s.stationId === station.id).length === 0 && (
                                        <li style={{ fontSize: '10px', color: '#9CA3AF' }}>No services linked</li>
                                      )}
                                    </ul>
                                  </td>
                                  <td>{station.city || 'N/A'}</td>
                                  <td>{station.address || 'N/A'}</td>

                                  <td>
                                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>{station.phone || 'N/A'}</div>
                                    <div style={{ fontSize: '12px', color: '#6B7280' }}>{station.email || 'N/A'}</div>
                                  </td>
                                  <td>
                                    <span className={`${dashboardStyles.statusBadge} ${station.status === 'Active' ? dashboardStyles.statusActive : dashboardStyles.statusPending}`}>
                                      {station.status || 'Inactive'}
                                    </span>
                                  </td>
                                  <td className={dashboardStyles.actionsTd}>
                                    <div className={dashboardStyles.actionsCell}>
                                      <button className={dashboardStyles.actionButton} onClick={() => handleStartEditStation(station)} title="Edit Station">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                      </button>

                                      <button className={dashboardStyles.deleteButton} onClick={() => handleDeleteStation(station.id)} title="Remove Station">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                      </button>
                                    </div>
                                  </td>
                                  <td>
                                    {station.description || "N/A"}
                                  </td>

                                </tr>
                              )}


                            </React.Fragment>
                          )) : (
                            <tr>
                              <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>No stations registered yet. Click &ldquo;+ Register Station&rdquo; to get started.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'add-station' && (
                <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                  <div className={dashboardStyles.addForm} style={{ padding: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ width: '64px', height: '64px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F97316' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                      </div>
                      <div>
                        <h3 className={dashboardStyles.addFormTitle} style={{ fontSize: '24px', marginBottom: '4px' }}>Register New Station</h3>
                        <p style={{ color: '#6B7280', fontSize: '14px' }}>Expand the StationHub network by adding a new service location.</p>
                      </div>
                    </div>

                    <form onSubmit={handleAddStation}>
                      <div className={dashboardStyles.addFormGrid}>
                        <div className={dashboardStyles.addFormGroup}>
                          <label className={dashboardStyles.addFormLabel}>Station Name *</label>
                          <input
                            type="text"
                            className={dashboardStyles.addFormInput}
                            placeholder="e.g. Downtown Service Center"
                            value={newStation.name}
                            onChange={(e) => setNewStation({ ...newStation, name: e.target.value })}
                            required
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup}>
                          <label className={dashboardStyles.addFormLabel}>City *</label>
                          <input
                            type="text"
                            className={dashboardStyles.addFormInput}
                            placeholder="e.g. New York"
                            value={newStation.city}
                            onChange={(e) => setNewStation({ ...newStation, city: e.target.value })}
                            required
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup}>
                          <label className={dashboardStyles.addFormLabel}>Phone Number *</label>
                          <input
                            type="tel"
                            className={dashboardStyles.addFormInput}
                            placeholder="+1 (555) 000-0000"
                            value={newStation.phone}
                            onChange={(e) => setNewStation({ ...newStation, phone: e.target.value })}
                            required
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup}>
                          <label className={dashboardStyles.addFormLabel}>Email Address</label>
                          <input
                            type="email"
                            className={dashboardStyles.addFormInput}
                            placeholder="station@example.com"
                            value={newStation.email}
                            onChange={(e) => setNewStation({ ...newStation, email: e.target.value })}
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup}>
                          <label className={dashboardStyles.addFormLabel}>Operating Status</label>
                          <select
                            className={dashboardStyles.addFormInput}
                            value={newStation.status}
                            onChange={(e) => setNewStation({ ...newStation, status: e.target.value })}
                          >
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: 'span 3' }}>
                          <label className={dashboardStyles.addFormLabel}>Full Address *</label>
                          <input
                            type="text"
                            className={dashboardStyles.addFormInput}
                            placeholder="e.g. 123 Main St, Suite 101, New York, NY"
                            value={newStation.address}
                            onChange={(e) => setNewStation({ ...newStation, address: e.target.value })}
                            required
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1/ -1' }}>
                          <label className={dashboardStyles.addFormLabel}>Station Description *</label>
                          <textarea
                            className={dashboardStyles.addFormInput}
                            placeholder="Write something about station"
                            value={newStation.description}
                            onChange={(e) => setNewStation({ ...newStation, description: e.target.value })}
                            required
                            rows={4}
                          />
                        </div>
                        <div className={dashboardStyles.addFormGroup} style={{ gridColumn: '1 / -1' }}>
                          <label className={dashboardStyles.addFormLabel}>Station Images</label>

                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => setStationImages(Array.from(e.target.files))}
                            className={dashboardStyles.addFormInput}
                          />
                        </div>
                      </div>

                      {/* Station Services Section */}
                      <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid #F3F4F6' }}>
                        <h4 className={dashboardStyles.addFormTitle} style={{ fontSize: '18px', color: '#F97316' }}>Station Services</h4>
                        <p style={{ color: '#6B7280', fontSize: '13px', marginBottom: '20px' }}>List the services this station will offer (e.g., Oil Change, Car Wash).</p>

                        <div className={dashboardStyles.addServiceGrid}>
                          <div className={dashboardStyles.addFormGroup} style={{ flex: '2 1 200px' }}>
                            <label className={dashboardStyles.addFormLabel}>Service Name</label>
                            <input type="text" className={dashboardStyles.addFormInput} placeholder="e.g. Engine Diagnostic" value={tempService.name} onChange={(e) => setTempService({ ...tempService, name: e.target.value })} />
                          </div>
                          <div className={dashboardStyles.addFormGroup} style={{ flex: '1 1 100px' }}>
                            <label className={dashboardStyles.addFormLabel}>Price ($)</label>
                            <input type="number" className={dashboardStyles.addFormInput} placeholder="49.99" value={tempService.price} onChange={(e) => setTempService({ ...tempService, price: e.target.value })} />
                          </div>
                          <div className={dashboardStyles.addFormGroup}>
                            <label className={dashboardStyles.addFormLabel}>Service Description</label>
                            <input type="text" className={dashboardStyles.addFormInput} placeholder='write something about this service' value={tempService.description} onChange={(e) => setTempService({ ...tempService, description: e.target.value })} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                            <button type="button" onClick={addPendingService} className={dashboardStyles.addButton} style={{ height: '42px', padding: '0 20px', width: '100%' }}>+ Add to List</button>
                          </div>
                        </div>

                        {pendingServices.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {pendingServices.map((service, index) => (
                              <div key={index} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', padding: '8px 16px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <span style={{ fontWeight: '600', fontSize: '13px' }}>{service.name}</span>
                                <span style={{ color: '#F97316', fontWeight: '700', fontSize: '13px' }}>${service.price}</span>
                                <button type="button" onClick={() => removePendingService(index)} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '48px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F3F4F6', paddingTop: '24px' }}>
                        <button type="submit" className={dashboardStyles.saveButton} style={{ padding: '14px 48px', fontSize: '16px' }}>
                          Register Station & Services
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}



              {activeTab === 'bookings' && (
                <div className={dashboardStyles.tabScrollArea}>
                  <div className={dashboardStyles.tableContainer}>
                    <div className={dashboardStyles.tableWrapper}>
                      <table className={dashboardStyles.table}>
                        <thead>
                          <tr>
                            <th>Service Center</th>
                            <th>Service</th>
                            <th>Vehicle</th>
                            <th>Date & Time</th>
                            <th>Payment</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings.length > 0 ? bookings.map((booking) => (
                            <tr key={booking.id}>
                              <td>{booking.serviceCenter || 'N/A'}</td>
                              <td>{booking.serviceName || 'N/A'}</td>
                              <td>{booking.vehicle || 'N/A'}</td>
                              <td>{booking.dateTime || 'N/A'}</td>
                              <td>${booking.payment || '0.00'}</td>
                              <td>
                                <span className={`${dashboardStyles.statusBadge} ${booking.status === 'Up-Coming' || booking.status === 'Confirmed' ? dashboardStyles.statusActive : dashboardStyles.statusPending}`}>
                                  {booking.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>No bookings found in database.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </>
    );
  }

  // If the admin is NOT logged in, show the Login component
  return (
    <>
      <Head>
        <title>Admin Portal Login</title>
        <meta name="description" content="Secure Admin Login Portal" />
      </Head>
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.glassCard}>
            <div className={styles.header}>
              <h1 className={styles.title}>Admin Portal</h1>
              <p className={styles.subtitle}>Sign in to access the admin dashboard</p>
            </div>
            <form onSubmit={handleLogin} className={styles.form}>
              {errorMsg && (
                <div className={styles.errorPopup}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  {errorMsg}
                </div>
              )}
              <div className={styles.inputGroup}>
                <label htmlFor="email" className={styles.label}>Admin Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className={styles.input}
                  placeholder="admin@yourdomain.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="password" className={styles.label}>Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className={styles.input}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>
              <button type="submit" className={styles.submitButton}>
                Sign In
              </button>
            </form>
            <div className={styles.footer}>
              <p>Authorized personnel only. Contact the system administrator for access.</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
