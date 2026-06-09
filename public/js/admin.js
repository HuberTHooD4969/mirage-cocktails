/* ==========================================================================
   Mirage Cocktails - Upgraded Admin Panel Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const authForm = document.getElementById('authForm');
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    const adminOtpInput = document.getElementById('adminOtp');
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

    let allBookings = [];

    // ----------------------------------------------------------------------
    // 1. JWT Session & 2FA Login Gate
    // ----------------------------------------------------------------------

    // Fetch and display active 2FA Mock OTP rolling code for easy developer logging
    const pollMock2FA = async () => {
        try {
            const res = await fetch('/api/auth/2fa-mock');
            const data = await res.json();
            if (devOtpVal) devOtpVal.textContent = data.code;
        } catch (err) {
            console.error('Failed to fetch rolling dev 2FA OTP:', err);
        }
    };

    // Poll OTP code every 5 seconds
    pollMock2FA();
    setInterval(pollMock2FA, 5000);

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
            const otp = adminOtpInput.value.trim();

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, otp })
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
                authError.textContent = err.message;
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem('adminToken');
            window.location.reload();
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
            btnLogout.style.display = 'block';

            applyFilterAndSearch();
            calculateStockRequirements(allBookings);

        } catch (err) {
            console.error('Session verification error:', err);
            sessionStorage.removeItem('adminToken');
            authSection.style.display = 'block';
            dashboardSection.style.display = 'none';
            btnLogout.style.display = 'none';
        }
    }


    // ----------------------------------------------------------------------
    // 2. Tab Navigation controls
    // ----------------------------------------------------------------------
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.replace('btn-primary', 'btn-outline'));
            btn.classList.replace('btn-outline', 'btn-primary');

            const tabId = btn.getAttribute('data-tab');
            tabContents.forEach(c => c.style.display = 'none');
            
            if (tabId === 'bookings') document.getElementById('tabBookings').style.display = 'block';
            if (tabId === 'stock') {
                document.getElementById('tabStock').style.display = 'block';
                calculateStockRequirements(allBookings);
            }
        });
    });


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
                year: 'numeric',
                weekday: 'short'
            });

            // Format pricing
            let totalVal = typeof b.totalPrice === 'number' ? `GHC ${b.totalPrice.toLocaleString()}` : b.totalPrice;
            let depositVal = typeof b.deposit === 'number' ? `GHC ${b.deposit.toLocaleString()}` : b.deposit;
            let balanceVal = typeof b.balance === 'number' ? `GHC ${b.balance.toLocaleString()}` : b.balance;

            // Status badges
            let badgeClass = 'pending';
            if (b.status === 'Deposit Paid') badgeClass = 'deposit-paid';
            if (b.status === 'Fully Paid') badgeClass = 'fully-paid';
            if (b.status === 'Refunded') badgeClass = 'fully-paid'; // reuse color theme
            if (b.status === 'Cancelled') badgeClass = 'cancelled';

            // Add-ons list
            const addonsNames = b.addons && b.addons.length > 0 
                ? b.addons.map(a => a.name.split(' ')[0]).join(', ') 
                : 'None';

            tr.innerHTML = `
                <td class="font-bold gold-text" style="font-size:0.75rem;">${b.id}</td>
                <td class="font-semibold" style="font-size:0.85rem;">${eventDate}</td>
                <td>
                    <div class="font-semibold">${b.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-phone"></i> ${b.phone}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-envelope"></i> ${b.email}</div>
                </td>
                <td><span class="badge" style="margin:0; padding:2px 8px; font-size:0.8rem;">${b.guests}</span></td>
                <td>
                    <div class="font-semibold" style="font-size:0.85rem;">${b.packageName}</div>
                    <div style="font-size:0.75rem; color: var(--text-muted);"><i class="fa-solid fa-clock"></i> ${b.durationHours || 5} Hours Service</div>
                    <div style="font-size:0.75rem; color: var(--gold-light);"><i class="fa-solid fa-cube"></i> ${b.barLabel || 'Compact'}</div>
                </td>
                <td style="font-size:0.8rem; color: var(--text-muted);">${addonsNames}</td>
                <td>
                    <div class="font-semibold">${totalVal}</div>
                    <div style="font-size:0.75rem; color: var(--gold);">${depositVal}</div>
                    <div style="font-size:0.75rem; color: var(--text-muted);">${balanceVal}</div>
                </td>
                <td style="font-size: 0.8rem; font-weight: 500;">${b.balanceDueDate}</td>
                <td>
                    <span class="status-badge ${badgeClass}">${b.status}</span>
                </td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-outline btn-roadmap" data-booking-id="${b.id}" style="padding:4px 8px; font-size:0.75rem;"><i class="fa-solid fa-route"></i> Roadmap</button>
                        <button class="btn btn-primary btn-edit-row" data-booking-id="${b.id}" style="padding:4px 8px; font-size:0.75rem;"><i class="fa-solid fa-edit"></i> Edit</button>
                    </div>
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
            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-users"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Total Attendance</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${totalGuests.toLocaleString()}</div>
                <small style="color:var(--text-muted);">Across all events</small>
            </div>
            
            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-wine-bottle"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Liquor / Spirits</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${spiritBottles} <span style="font-size:1rem; font-weight:400; font-family:var(--font-body);">Btls</span></div>
                <small style="color:var(--text-muted);">${spiritLiters.toFixed(1)} L needed (45ml/serv)</small>
            </div>

            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-whiskey-glass"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Mixers & Juices</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${mixerLiters} <span style="font-size:1rem; font-weight:400; font-family:var(--font-body);">Ltrs</span></div>
                <small style="color:var(--text-muted);">Fruit purees & juices (100ml/serv)</small>
            </div>

            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-cubes"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Ice Requirements</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${iceKg} <span style="font-size:1rem; font-weight:400; font-family:var(--font-body);">Kgs</span></div>
                <small style="color:var(--text-muted);">0.5kg cooling ice per guest</small>
            </div>

            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left; grid-column: span 2;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-martini-glass-citrus"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Estimated Total Servings</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${totalDrinks.toLocaleString()} <span style="font-size:1rem; font-weight:400; font-family:var(--font-body);">Serves</span></div>
                <small style="color:var(--text-muted);">Adjusted for packages & service hours</small>
            </div>

            <div class="package-card" style="padding:1.5rem; border: 1px solid var(--glass-border); text-align: left; grid-column: span 2;">
                <div class="success-icon-container" style="margin: 0 0 1rem 0; width:45px; height:45px; font-size:1.3rem; background: var(--gold); color:#000;">
                    <i class="fa-solid fa-glass-water"></i>
                </div>
                <h4 style="color:var(--text-light); font-size: 0.95rem;">Branded Cups & Garnishes</h4>
                <div class="gold-text font-bold" style="font-size: 2.2rem; font-family:var(--font-heading); margin-top:0.4rem;">${cupsCount.toLocaleString()} <span style="font-size:1rem; font-weight:400; font-family:var(--font-body);">Units</span></div>
                <small style="color:var(--text-muted);">Includes 10% spill & setup buffer</small>
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
