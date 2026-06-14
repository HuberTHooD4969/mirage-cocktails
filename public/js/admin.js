/* ==========================================================================
   Mirage Cocktails - Upgraded Admin Panel Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const sidebarSection = document.getElementById('sidebarSection');
    const authForm = document.getElementById('authForm');
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    const btnAuth = document.getElementById('btnAuth');
    const authError = document.getElementById('authError');
    const btnLogout = document.getElementById('btnLogout');
    const devOtpVal = document.getElementById('devOtpVal');
    
    const bookingsTableBody = document.getElementById('bookingsTableBody');
    const adminSearch = document.getElementById('adminSearch');
    const statusFilter = document.getElementById('statusFilter');
    const btnRefresh = document.getElementById('btnRefresh');

    const statsTotal = document.getElementById('statsTotal');
    const statsPending = document.getElementById('statsPending');
    const plannerEventCount = document.getElementById('plannerEventCount');
    const stockPlannerGrid = document.getElementById('stockPlannerGrid');

    // Modals
    const roadmapModal = document.getElementById('roadmapModal');
    const roadmapContent = document.getElementById('roadmapContent');
    const btnCloseRoadmap = document.getElementById('btnCloseRoadmap');
    const btnPrintRoadmapAction = document.getElementById('btnPrintRoadmapAction');

    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const editId = document.getElementById('editId');
    const editName = document.getElementById('editName');
    const editGuests = document.getElementById('editGuests');
    const editPrice = document.getElementById('editPrice');
    const editStatus = document.getElementById('editStatus');
    const editNotes = document.getElementById('editNotes');
    const btnCloseEdit = document.getElementById('btnCloseEdit');
    const btnDeleteBookingAction = document.getElementById('btnDeleteBookingAction');

    // Password feature
    const navChangePassword = document.getElementById('navChangePassword');
    const passwordModal = document.getElementById('passwordModal');
    const btnClosePassword = document.getElementById('btnClosePassword');
    const passwordForm = document.getElementById('passwordForm');
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmNewPassword = document.getElementById('confirmNewPassword');
    const btnSubmitPassword = document.getElementById('btnSubmitPassword');

    let allBookings = [];

    // ----------------------------------------------------------------------
    // 1. JWT Session Login Gate
    // ----------------------------------------------------------------------

    // Check session storage for existing JWT token
    const savedToken = sessionStorage.getItem('adminToken');
    if (savedToken) {
        verifySessionAndLoad(savedToken);
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = adminUsernameInput.value.trim();
            const password = adminPasswordInput.value.trim();

            authError.style.display = 'none';
            btnAuth.innerHTML = 'Signing In... <i class="fa-solid fa-spinner fa-spin"></i>';
            btnAuth.disabled = true;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Authentication failed.');
                }

                sessionStorage.setItem('adminToken', data.token);
                verifySessionAndLoad(data.token);

            } catch (err) {
                sessionStorage.removeItem('adminToken');
                authError.style.display = 'block';
                authError.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${err.message}`;
                btnAuth.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right-to-bracket"></i>';
                btnAuth.disabled = false;
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem('adminToken');
            window.location.reload();
        });
    }

    // --- Password Change Logic ---
    if (navChangePassword) {
        navChangePassword.addEventListener('click', () => {
            passwordForm.reset();
            passwordModal.classList.add('active');
        });
    }
    if (btnClosePassword) {
        btnClosePassword.addEventListener('click', () => {
            passwordModal.classList.remove('active');
        });
    }
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (newPassword.value !== confirmNewPassword.value) {
                alert("New passwords do not match!");
                return;
            }
            btnSubmitPassword.disabled = true;
            btnSubmitPassword.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';
            try {
                const token = sessionStorage.getItem('adminToken');
                const res = await fetch('/api/auth/password', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        currentPassword: currentPassword.value,
                        newPassword: newPassword.value
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                
                alert("Password updated successfully! Please log in again.");
                passwordModal.classList.remove('active');
                if (btnLogout) btnLogout.click();
            } catch (err) {
                alert("Error: " + err.message);
            } finally {
                btnSubmitPassword.disabled = false;
                btnSubmitPassword.textContent = 'Update Password';
            }
        });
    }

    async function verifySessionAndLoad(token) {
        try {
            const response = await fetch('/api/bookings', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Session validation failed.');
            }

            const data = await response.json();
            
            allBookings = data;
            authSection.style.display = 'none';
            dashboardSection.style.display = 'block';
            if (sidebarSection) sidebarSection.style.display = 'flex';
            btnLogout.style.display = 'block';

            applyFilterAndSearch();
            calculateStockRequirements(allBookings);

        } catch (err) {
            console.error('Session verification error:', err);
            sessionStorage.removeItem('adminToken');
            authSection.style.display = 'block';
            dashboardSection.style.display = 'none';
            if (sidebarSection) sidebarSection.style.display = 'none';
            btnLogout.style.display = 'none';
        }
    }


    // ----------------------------------------------------------------------
    // 2. Sidebar Navigation controls
    // ----------------------------------------------------------------------
    const navBookings = document.getElementById('navBookings');
    const navStock = document.getElementById('navStock');
    const viewBookings = document.getElementById('viewBookings');
    const viewStock = document.getElementById('viewStock');
    const currentViewTitle = document.getElementById('currentViewTitle');

    if (navBookings && navStock) {
        navBookings.addEventListener('click', () => {
            navBookings.classList.add('active');
            navStock.classList.remove('active');
            viewBookings.style.display = 'block';
            viewStock.style.display = 'none';
            currentViewTitle.textContent = 'Bookings Manager';
        });

        navStock.addEventListener('click', () => {
            navStock.classList.add('active');
            navBookings.classList.remove('active');
            viewStock.style.display = 'block';
            viewBookings.style.display = 'none';
            currentViewTitle.textContent = 'Stock Planner';
            calculateStockRequirements(allBookings);
        });
    }


    // ----------------------------------------------------------------------
    // 3. Render Bookings Data Table
    // ----------------------------------------------------------------------
    function renderBookings(bookings) {
        if (!bookingsTableBody) return;
        bookingsTableBody.innerHTML = '';

        if (bookings.length === 0) {
            bookingsTableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        No bookings found matching filters.
                    </td>
                </tr>
            `;
            return;
        }

        bookings.forEach(b => {
            const tr = document.createElement('tr');
            
            const eventDate = new Date(b.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            // Format pricing
            let totalVal = typeof b.totalPrice === 'number' ? `GHC ${b.totalPrice.toLocaleString()}` : b.totalPrice;
            let depositVal = typeof b.deposit === 'number' ? `GHC ${b.deposit.toLocaleString()}` : b.deposit;

            // Status badges
            let badgeClass = 'badge-warning';
            let iconClass = 'fa-clock';
            if (b.status === 'Deposit Paid') { badgeClass = 'badge-success'; iconClass = 'fa-check-circle'; }
            if (b.status === 'Fully Paid') { badgeClass = 'badge-success'; iconClass = 'fa-check-double'; }
            if (b.status === 'Refunded') { badgeClass = 'badge-warning'; iconClass = 'fa-rotate-left'; }
            if (b.status === 'Cancelled') { badgeClass = 'badge-danger'; iconClass = 'fa-xmark'; }

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; color:var(--admin-gold);">${b.id}</div>
                    <div style="font-size:0.8rem; color:var(--admin-text-muted);"><i class="fa-regular fa-calendar"></i> ${eventDate}</div>
                </td>
                <td>
                    <div style="font-weight:600;">${b.name}</div>
                    <div style="font-size:0.8rem; color:var(--admin-text-muted);">${b.phone}</div>
                </td>
                <td>
                    <div style="font-weight:600;">${b.packageName} <span class="badge" style="background:#2d3340; font-size:0.7rem; padding:2px 6px;">${b.guests} Guests</span></div>
                    <div style="font-size:0.8rem; color:var(--admin-text-muted);">${b.durationHours || 5} Hours</div>
                </td>
                <td>
                    <div style="font-weight:600;">${totalVal}</div>
                    <div style="font-size:0.8rem; color:var(--admin-text-muted);">Dep: ${depositVal}</div>
                </td>
                <td>
                    <span class="badge ${badgeClass}"><i class="fa-solid ${iconClass}"></i> ${b.status}</span>
                </td>
                <td style="text-align:right;">
                    <button class="btn btn-outline btn-roadmap" data-booking-id="${b.id}" style="padding:4px 8px; font-size:0.8rem; margin-right:4px;" title="Print Roadmap"><i class="fa-solid fa-print"></i></button>
                    <button class="btn btn-outline btn-edit-row" data-booking-id="${b.id}" style="padding:4px 8px; font-size:0.8rem;" title="Edit Booking"><i class="fa-solid fa-pen"></i></button>
                </td>
            `;

            bookingsTableBody.appendChild(tr);
        });

        // Event listener for Roadmap Summary popup
        const roadmapBtns = bookingsTableBody.querySelectorAll('.btn-roadmap');
        roadmapBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const bId = btn.getAttribute('data-booking-id');
                const booking = allBookings.find(x => x.id === bId);
                if (booking) openRoadmap(booking);
            });
        });

        // Event listener for Edit Summary popup
        const editRowBtns = bookingsTableBody.querySelectorAll('.btn-edit-row');
        editRowBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const bId = btn.getAttribute('data-booking-id');
                const booking = allBookings.find(x => x.id === bId);
                if (booking) openEdit(booking);
            });
        });
    }

    // ----------------------------------------------------------------------
    // 4. Stock Planner Calculations logic
    // ----------------------------------------------------------------------
    function calculateStockRequirements(bookings) {
        if (!stockPlannerGrid || !plannerEventCount) return;

        // Filter active events
        const activeBookings = bookings.filter(b => b.status !== 'Cancelled' && b.status !== 'Refunded');
        plannerEventCount.textContent = activeBookings.length;

        let totalGuests = 0;
        let totalDrinks = 0;

        activeBookings.forEach(b => {
            totalGuests += b.guests;
            
            // Silver = 3 drinks/guest, Gold = 4, Premium = 5, Custom = 4
            let drinksMultiplier = 4;
            if (b.packageType === 'silver') drinksMultiplier = 3;
            if (b.packageType === 'gold') drinksMultiplier = 4;
            if (b.packageType === 'premium') drinksMultiplier = 5;

            // Extra duration drinks (adds +1 drink per extra hour)
            const baseHours = 5;
            const extraHours = Math.max(0, (b.durationHours || 5) - baseHours);
            const durationMultiplier = drinksMultiplier + extraHours;

            totalDrinks += (b.guests * durationMultiplier);
        });

        // Recipe Math
        // Spirits: 45ml per drink -> Liters -> divide by 0.75L (bottles)
        const spiritLiters = totalDrinks * 0.045;
        const spiritBottles = Math.ceil(spiritLiters / 0.75);

        // Mixers (Juice/syrups): 100ml per drink -> Liters
        const mixerLiters = Math.ceil(totalDrinks * 0.10);

        // Ice: 0.5kg per guest
        const iceKg = Math.ceil(totalGuests * 0.5);

        // Branded Cups: 1.1 per drink (includes 10% spill buffer)
        const cupsCount = Math.ceil(totalDrinks * 1.1);

        stockPlannerGrid.innerHTML = `
            <div class="stock-card">
                <h4>Total Attendance</h4>
                <p>${totalGuests.toLocaleString()}</p>
                <small class="text-muted">Across active events</small>
            </div>
            
            <div class="stock-card">
                <h4>Liquor Bottles</h4>
                <p>${spiritBottles}</p>
                <small class="text-muted">750ml bottles needed</small>
            </div>

            <div class="stock-card">
                <h4>Mixers & Juices</h4>
                <p>${mixerLiters}L</p>
                <small class="text-muted">Liters of puree/juice</small>
            </div>

            <div class="stock-card">
                <h4>Ice Kgs</h4>
                <p>${iceKg}kg</p>
                <small class="text-muted">Cooling ice volume</small>
            </div>

            <div class="stock-card">
                <h4>Total Servings</h4>
                <p>${totalDrinks.toLocaleString()}</p>
                <small class="text-muted">Estimated drinks poured</small>
            </div>

            <div class="stock-card">
                <h4>Branded Cups</h4>
                <p>${cupsCount.toLocaleString()}</p>
                <small class="text-muted">Includes 10% buffer</small>
            </div>
        `;
    }


    // ----------------------------------------------------------------------
    // 5. Printable Technical Summary Exporter (Roadmap)
    // ----------------------------------------------------------------------
    function openRoadmap(booking) {
        if (!roadmapModal || !roadmapContent) return;
        roadmapContent.innerHTML = '';

        const addonsList = booking.addons && booking.addons.length > 0 
            ? booking.addons.map(a => a.name).join(', ') 
            : 'None Selected';

        const totalVal = typeof booking.totalPrice === 'number' ? `GHC ${booking.totalPrice.toLocaleString()}` : booking.totalPrice;
        const depositVal = typeof booking.deposit === 'number' ? `GHC ${booking.deposit.toLocaleString()}` : booking.deposit;
        const balanceVal = typeof booking.balance === 'number' ? `GHC ${booking.balance.toLocaleString()}` : booking.balance;

        // Calculate installation timing (Buffer times: Arrival is 3 hours before start time)
        const setupHours = 3; 

        const contentHtml = `
            <span class="review-label">Booking ID:</span>
            <span class="review-val font-bold gold-text">${booking.id}</span>

            <span class="review-label">Created On:</span>
            <span class="review-val">${new Date(booking.createdAt).toLocaleString()}</span>

            <span class="review-label">Client Name:</span>
            <span class="review-val font-semibold">${booking.name}</span>

            <span class="review-label">Phone Contact:</span>
            <span class="review-val">${booking.phone}</span>

            <span class="review-label">Email:</span>
            <span class="review-val">${booking.email}</span>

            <span class="review-label">Instagram:</span>
            <span class="review-val">${booking.instagram}</span>

            <span class="review-label span-full divider"></span>

            <span class="review-label">Event Date:</span>
            <span class="review-val font-bold">${new Date(booking.date).toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</span>

            <span class="review-label">Guests Size:</span>
            <span class="review-val"><span class="badge" style="margin:0; padding:2px 8px;">${booking.guests} Guests</span></span>

            <span class="review-label">Bar Template:</span>
            <span class="review-val font-semibold">${booking.barLabel || 'Compact Bar'}</span>

            <span class="review-label">Add-ons Selected:</span>
            <span class="review-val">${addonsList}</span>

            <span class="review-label">Duration:</span>
            <span class="review-val">${booking.durationHours || 5} Hours Service</span>

            <span class="review-label">Timeline Guide:</span>
            <span class="review-val" style="color: var(--text-warning); font-weight:600;"><i class="fa-solid fa-clock-rotate-left"></i> Arrival Required ${setupHours} Hours prior for Setup/Logistics</span>

            <span class="review-label span-full divider"></span>

            <span class="review-label">Venue Logistics:</span>
            <span class="review-val">
                <div>Floor level: ${booking.logistics?.floors || 0}</div>
                <div>Elevator Access: ${booking.logistics?.elevator ? '✅ Yes' : '❌ No'}</div>
                <div>Power socket nearby: ${booking.logistics?.powerSupply ? '✅ Confirmed' : '❌ No'}</div>
                <div style="font-size:0.85rem; color:var(--text-muted); font-style:italic; margin-top:4px;">Delivery notes: "${booking.logistics?.notes || 'None'}"</div>
            </span>

            <span class="review-label">Mileage Transport:</span>
            <span class="review-val">${booking.mileage?.distanceKm || 0} KM (HQ to event location, transport GHC ${booking.mileage?.transportCost?.toLocaleString() || 0})</span>

            <span class="review-label span-full divider"></span>

            <span class="review-label font-bold">Total Cost:</span>
            <span class="review-val font-bold gold-text">${totalVal}</span>

            <span class="review-label">70% Booking Deposit:</span>
            <span class="review-val font-semibold">${depositVal}</span>

            <span class="review-label">30% Balance:</span>
            <span class="review-val">${balanceVal} (Due by ${booking.balanceDueDate})</span>

            <span class="review-label">Order Status:</span>
            <span class="review-val"><span class="status-badge" style="background: rgba(212,175,55,0.1); border:1px solid var(--gold); color:var(--gold-light); font-size:0.75rem;">${booking.status}</span></span>

            ${booking.notes ? `
                <span class="review-label span-full divider"></span>
                <span class="review-label">Client Notes:</span>
                <span class="review-val" style="font-style:italic;">"${booking.notes}"</span>
            ` : ''}
        `;

        roadmapContent.innerHTML = contentHtml;
        roadmapModal.classList.add('active');
    }

    if (btnCloseRoadmap) {
        btnCloseRoadmap.addEventListener('click', () => {
            roadmapModal.classList.remove('active');
        });
    }

    if (btnPrintRoadmapAction) {
        btnPrintRoadmapAction.addEventListener('click', () => {
            window.print();
        });
    }


    // ----------------------------------------------------------------------
    // 6. Modify and Delete Bookings Forms (Edit Modal)
    // ----------------------------------------------------------------------
    function openEdit(booking) {
        if (!editModal) return;

        editId.value = booking.id;
        editName.value = booking.name;
        editGuests.value = booking.guests;
        editPrice.value = typeof booking.totalPrice === 'number' ? booking.totalPrice : '';
        editStatus.value = booking.status;
        editNotes.value = booking.notes || '';

        editModal.classList.add('active');
    }

    if (btnCloseEdit) {
        btnCloseEdit.addEventListener('click', () => {
            editModal.classList.remove('active');
        });
    }

    // Submit edit form
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = sessionStorage.getItem('adminToken');
            if (!token) return;

            const id = editId.value;
            const payload = {
                name: editName.value.trim(),
                guests: parseInt(editGuests.value, 10),
                status: editStatus.value,
                notes: editNotes.value.trim()
            };

            const manualPrice = parseFloat(editPrice.value);
            if (!isNaN(manualPrice)) {
                payload.totalPrice = manualPrice;
            }

            try {
                const response = await fetch(`/api/bookings/${id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to update booking.');
                }

                // Update memory list and reload table
                const idx = allBookings.findIndex(x => x.id === id);
                if (idx !== -1) {
                    allBookings[idx] = data.booking;
                }

                editModal.classList.remove('active');
                applyFilterAndSearch();
                calculateStockRequirements(allBookings);

            } catch (err) {
                alert(`Error saving modifications: ${err.message}`);
            }
        });
    }

    // Delete Booking Action
    if (btnDeleteBookingAction) {
        btnDeleteBookingAction.addEventListener('click', async () => {
            const token = sessionStorage.getItem('adminToken');
            if (!token) return;

            const id = editId.value;
            if (!confirm(`Are you absolutely sure you want to delete booking ID: ${id} from the database? This action is permanent.`)) {
                return;
            }

            try {
                const response = await fetch(`/api/bookings/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to delete record.');
                }

                allBookings = allBookings.filter(x => x.id !== id);
                editModal.classList.remove('active');
                applyFilterAndSearch();
                calculateStockRequirements(allBookings);

            } catch (err) {
                alert(`Error deleting record: ${err.message}`);
            }
        });
    }


    // ----------------------------------------------------------------------
    // 7. Search box, filters, and refresh controls
    // ----------------------------------------------------------------------
    function applyFilterAndSearch() {
        const query = adminSearch.value.toLowerCase().trim();
        const statusVal = statusFilter.value;

        const filtered = allBookings.filter(b => {
            const matchesQuery = 
                b.id.toLowerCase().includes(query) ||
                b.name.toLowerCase().includes(query) ||
                b.email.toLowerCase().includes(query) ||
                b.phone.includes(query);

            const matchesStatus = statusVal === 'all' || b.status === statusVal;

            return matchesQuery && matchesStatus;
        });

        renderBookings(filtered);
        
        // Update dashboard header stats
        statsTotal.textContent = allBookings.length;
        const pendingCount = allBookings.filter(b => b.status === 'Pending').length;
        statsPending.textContent = pendingCount;
        
        let estRevenue = 0;
        allBookings.forEach(b => {
            if (b.status !== 'Cancelled' && b.status !== 'Refunded') {
                estRevenue += (typeof b.totalPrice === 'number' ? b.totalPrice : 0);
            }
        });
        const statsRevenue = document.getElementById('statsRevenue');
        if (statsRevenue) {
            statsRevenue.textContent = `GHC ${estRevenue.toLocaleString()}`;
        }
    }

    if (adminSearch) adminSearch.addEventListener('input', applyFilterAndSearch);
    if (statusFilter) statusFilter.addEventListener('change', applyFilterAndSearch);

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const token = sessionStorage.getItem('adminToken');
            if (token) verifySessionAndLoad(token);
        });
    }
});
