/* ==========================================================================
   Mirage Cocktails - Client Interaction Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. Navigation & Mobile Menu
    // ----------------------------------------------------------------------
    const header = document.querySelector('.header');
    const mobileToggle = document.getElementById('mobileToggle');
    const navbar = document.getElementById('navbar');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Active nav link highlighting based on scroll position
        const scrollPos = window.scrollY + 150; // offset for header height
        const sections = document.querySelectorAll('section[id]');
        let currentSection = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                currentSection = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active-link');
            const href = link.getAttribute('href');
            if (href && href === '#' + currentSection) {
                link.classList.add('active-link');
            }
        });
    });

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            mobileToggle.classList.toggle('active');
            navbar.classList.toggle('active');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navbar.classList.contains('active')) {
                mobileToggle.classList.remove('active');
                navbar.classList.remove('active');
            }
        });
    });


    // ----------------------------------------------------------------------
    // 2. 3D Mouse Parallax Background Elements
    // ----------------------------------------------------------------------
    const particles = document.querySelectorAll('.floating-particle');
    
    window.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX / window.innerWidth;
        const mouseY = e.clientY / window.innerHeight;
        
        particles.forEach((particle, index) => {
            const speed = (index + 1) * 25;
            const xShift = (mouseX - 0.5) * speed;
            const yShift = (mouseY - 0.5) * speed;
            const rotateFactor = (mouseX - 0.5) * speed * 2;
            
            particle.style.transform = `translate(${xShift}px, ${yShift}px) rotate(${rotateFactor}deg)`;
        });
    });


    // ----------------------------------------------------------------------
    // 3. 3D Tilt Effect on Cards (Flyer and Package Cards)
    // ----------------------------------------------------------------------
    const tiltElements = [
        document.getElementById('flyerCard'),
        document.getElementById('cardSilver'),
        document.getElementById('cardGold'),
        document.getElementById('cardPremium')
    ];

    tiltElements.forEach(element => {
        if (!element) return;

        element.addEventListener('mousemove', (e) => {
            const rect = element.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            
            const tiltX = (0.5 - y) * 20; 
            const tiltY = (x - 0.5) * 20;
            
            element.style.setProperty('--rx', `${tiltX}deg`);
            element.style.setProperty('--ry', `${tiltY}deg`);
            element.style.boxShadow = `0 25px 50px rgba(212, 175, 55, ${0.15 + (Math.abs(tiltX) + Math.abs(tiltY)) / 150})`;
        });

        element.addEventListener('mouseleave', () => {
            element.style.setProperty('--rx', `0deg`);
            element.style.setProperty('--ry', `0deg`);
            element.style.boxShadow = '';
        });
    });


    // ----------------------------------------------------------------------
    // 4. Dynamic Calendar Code (Blocks Booked Slots & Under 14-days Slots)
    // ----------------------------------------------------------------------
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let blockedDates = [];

    const calMonthYear = document.getElementById('calMonthYear');
    const calendarGrid = document.getElementById('calendarGrid');
    const btnPrevMonth = document.getElementById('btnPrevMonth');
    const btnNextMonth = document.getElementById('btnNextMonth');
    const formDate = document.getElementById('formDate');
    const calendarWarn = document.getElementById('calendarWarn');

    const fetchAvailability = async () => {
        try {
            const response = await fetch('/api/availability');
            blockedDates = await response.json();
            renderCalendar();
        } catch (err) {
            console.error('Error fetching calendar availability:', err);
        }
    };

    const renderCalendar = () => {
        if (!calendarGrid || !calMonthYear) return;
        calendarGrid.innerHTML = '';

        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();

        const monthName = new Date(currentYear, currentMonth).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        calMonthYear.textContent = monthName;

        // Add empty padding slots for alignment
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('span');
            emptyCell.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyCell);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= lastDay; day++) {
            const cell = document.createElement('span');
            cell.className = 'calendar-day';
            cell.textContent = day;

            const dateObj = new Date(currentYear, currentMonth, day);
            const dateStr = dateObj.toISOString().split('T')[0];

            // 14-days booking limit logic
            const minBookingLimit = new Date(today.getTime() + (14 * 24 * 60 * 60 * 1000));

            if (dateObj < minBookingLimit) {
                cell.classList.add('booked');
                cell.title = "Dates under 14 days are locked";
            } else if (blockedDates.includes(dateStr)) {
                cell.classList.add('booked');
                cell.title = "Fully Booked (Sold Out)";
            } else {
                // If selected previously, maintain check
                if (formDate.value === dateStr) {
                    cell.classList.add('selected');
                }

                cell.addEventListener('click', () => {
                    const activeSelected = calendarGrid.querySelector('.calendar-day.selected');
                    if (activeSelected) activeSelected.classList.remove('selected');
                    
                    cell.classList.add('selected');
                    formDate.value = dateStr;
                    
                    const prettyDate = dateObj.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    
                    calendarWarn.textContent = `Selected Date: ${prettyDate}`;
                    calendarWarn.className = "form-help gold-text font-semibold";
                    calculateCosts();
                });
            }

            calendarGrid.appendChild(cell);
        }
    };

    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
    }

    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
    }

    // Initialize calendar
    fetchAvailability();

    // Pre-fetch Paystack config once at load for faster checkout
    let paystackPublicKey = '';
    let paystackSubaccount = '';
    (async () => {
        try {
            const configRes = await fetch('/api/config');
            const configData = await configRes.json();
            paystackPublicKey = configData.paystackPublicKey;
            paystackSubaccount = configData.paystackSubaccount;
        } catch (err) {
            console.error('Failed to pre-load Paystack config:', err);
        }
    })();


    // ----------------------------------------------------------------------
    // 5. Booking Form Cost Configurator & Calculations
    // ----------------------------------------------------------------------
    const bookingCard = document.getElementById('bookingCard');
    const formPackage = document.getElementById('formPackage');
    const formGuests = document.getElementById('formGuests');

    const formName = document.getElementById('formName');
    const formEmail = document.getElementById('formEmail');
    const formPhone = document.getElementById('formPhone');
    const formInstagram = document.getElementById('formInstagram');
    const formNotes = document.getElementById('formNotes');

    // Select package from packages section buttons
    const selectPkgBtns = document.querySelectorAll('[data-pkg-select]');
    selectPkgBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const pkg = btn.getAttribute('data-pkg-select');
            if (formPackage) {
                formPackage.value = pkg;
                calculateCosts();
            }
        });
    });

    const prices = {
        silver: 8000,
        gold: 9500,
        premium: 11500
    };

    const packageNames = {
        silver: 'Silver Package',
        gold: 'Gold Package',
        premium: 'Premium Package'
    };

    // Attach calculator update events
    [formPackage, formGuests].forEach(el => {
        if (el) el.addEventListener('change', calculateCosts);
    });
    if (formGuests) formGuests.addEventListener('input', calculateCosts);

    // Dynamic calculations object
    let currentCalculation = {
        packageType: '',
        packageName: '',
        guests: 0,
        total: 0,
        deposit: 0,
        balance: 0,
        balanceDueDate: ''
    };

    function calculateCosts() {
        const pkg = formPackage.value;
        const guestCount = parseInt(formGuests.value, 10);
        const eventDateStr = formDate.value;

        if (!pkg || isNaN(guestCount) || guestCount <= 0) return;

        currentCalculation.packageType = pkg;
        currentCalculation.packageName = packageNames[pkg] || pkg;
        currentCalculation.guests = guestCount;

        // Custom Pricing (> 200 Guests)
        if (guestCount > 200) {
            currentCalculation.total = 'Custom Quote';
            currentCalculation.deposit = 'Pending Quote';
            currentCalculation.balance = 'Pending Quote';
            currentCalculation.balanceDueDate = 'N/A';
        } else {
            const basePrice = prices[pkg] || 0;
            const total = basePrice;

            currentCalculation.total = total;
            currentCalculation.deposit = total * 0.70;
            currentCalculation.balance = total * 0.30;

            if (eventDateStr) {
                const eventDate = new Date(eventDateStr);
                const dueDate = new Date(eventDate.getTime() - (14 * 24 * 60 * 60 * 1000));
                currentCalculation.balanceDueDate = dueDate.toISOString().split('T')[0];
            } else {
                currentCalculation.balanceDueDate = 'Pending Date';
            }
        }

        updateInvoiceScreen();
    }

    function updateInvoiceScreen() {
        const revName = document.getElementById('revName');
        const revDate = document.getElementById('revDate');
        const revPackage = document.getElementById('revPackage');
        const revGuests = document.getElementById('revGuests');
        const revTotal = document.getElementById('revTotal');
        const revDeposit = document.getElementById('revDeposit');
        const revBalance = document.getElementById('revBalance');
        const revDueDate = document.getElementById('revDueDate');

        if (!revName) return;

        revName.textContent = formName.value || '-';
        revDate.textContent = formDate.value || 'Not Selected';
        revPackage.textContent = currentCalculation.packageName || '-';
        revGuests.textContent = formGuests.value || '0';

        if (typeof currentCalculation.total === 'number') {
            revTotal.textContent = `GHC ${currentCalculation.total.toLocaleString()}`;
            revDeposit.textContent = `GHC ${currentCalculation.deposit.toLocaleString()}`;
            revBalance.textContent = `GHC ${currentCalculation.balance.toLocaleString()}`;
        } else {
            revTotal.textContent = currentCalculation.total;
            revDeposit.textContent = currentCalculation.deposit;
            revBalance.textContent = currentCalculation.balance;
        }

        revDueDate.textContent = currentCalculation.balanceDueDate;
    }


    // ----------------------------------------------------------------------
    // 6. Step Wizard Navigation Logic (3-Step: Setup -> Contact -> Payment)
    // ----------------------------------------------------------------------
    const btnGoToStep2 = document.getElementById('btnGoToStep2');
    const btnBackToStep1 = document.getElementById('btnBackToStep1');
    const btnGoToStep3 = document.getElementById('btnGoToStep3');
    const btnBackToStep2 = document.getElementById('btnBackToStep2');
    const btnSubmitBooking = document.getElementById('btnSubmitBooking');

    const allStepSides = document.querySelectorAll('.booking-card-side');
    const stepSideIds = ['step1Side', 'step2Side', 'step3Side'];

    // Set active step by showing the correct panel and hiding others
    function setStep(stepNumber) {
        const targetId = stepSideIds[stepNumber - 1];
        allStepSides.forEach(side => {
            side.classList.remove('active-step');
        });
        const targetSide = document.getElementById(targetId);
        if (targetSide) {
            targetSide.classList.add('active-step');
            // Scroll to the booking section for visibility
            targetSide.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Initialize: show step 1
    setStep(1);

    // Validation rules
    const validateStep1 = () => {
        if (!formPackage.value) {
            alert('Please select a desired bar package.');
            return false;
        }
        
        const guestCount = parseInt(formGuests.value, 10);
        if (isNaN(guestCount) || guestCount <= 0) {
            alert('Please enter a valid guest size.');
            return false;
        }
        
        if (!formDate.value) {
            alert('Please select an available date slot on the calendar.');
            return false;
        }

        return true;
    };

    const validateStep2 = () => {
        if (!formName.value.trim()) {
            alert('Please enter your full name.');
            return false;
        }
        if (!formEmail.value.trim() || !formEmail.checkValidity()) {
            alert('Please enter a valid email address.');
            return false;
        }
        if (!formPhone.value.trim()) {
            alert('Please enter your phone contact.');
            return false;
        }
        return true;
    };

    // Step Navigation Events
    if (btnGoToStep2) {
        btnGoToStep2.addEventListener('click', () => {
            if (validateStep1()) {
                setStep(2);
            }
        });
    }

    if (btnBackToStep1) {
        btnBackToStep1.addEventListener('click', () => {
            setStep(1);
        });
    }

    if (btnGoToStep3) {
        btnGoToStep3.addEventListener('click', () => {
            if (validateStep2()) {
                setStep(3);
                calculateCosts();
            }
        });
    }

    if (btnBackToStep2) {
        btnBackToStep2.addEventListener('click', () => {
            setStep(2);
        });
    }


    // 7. Secure Deposit Payment Submit (Paystack Checkout Integration)
    // ----------------------------------------------------------------------
    const successModal = document.getElementById('successModal');
    const successBookingId = document.getElementById('successBookingId');
    const successName = document.getElementById('successName');
    const successDeposit = document.getElementById('successDeposit');
    const successBalance = document.getElementById('successBalance');
    const successDueDate = document.getElementById('successDueDate');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const policyAgreement = document.getElementById('policyAgreement');


    if (btnSubmitBooking) {
        btnSubmitBooking.addEventListener('click', async () => {
            if (!policyAgreement.checked) {
                alert('Please check the authorization box to complete the booking payment.');
                return;
            }

            btnSubmitBooking.disabled = true;
            btnSubmitBooking.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing Paystack...';

            const payload = {
                name: formName.value.trim(),
                email: formEmail.value.trim(),
                phone: formPhone.value.trim(),
                instagram: formInstagram.value.trim(),
                date: formDate.value,
                guests: parseInt(formGuests.value, 10),
                packageType: formPackage.value,
                notes: formNotes.value.trim()
            };

            try {
                // 1. Save booking as Pending on server
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Server error occurred.');
                }

                const b = data.booking;

                // 2. Custom quote fallback (if guests > 200) - skip Paystack checkout
                if (b.isCustom) {
                    successBookingId.textContent = b.id;
                    successName.textContent = b.name;
                    successDeposit.textContent = 'Pending Quote';
                    successBalance.textContent = 'Pending Quote';
                    successDueDate.textContent = b.balanceDueDate;
                    
                    // Show success modal
                    successModal.classList.add('active');
                    return;
                }

                // 3. Open Paystack Checkout Popup for standard bookings
                if (!paystackPublicKey) {
                    throw new Error('Paystack configuration is missing on the server. Please contact support.');
                }

                btnSubmitBooking.innerHTML = '<i class="fa-solid fa-credit-card"></i> Awaiting Payment...';

                // Get selected payment channel
                const selectedChannel = document.querySelector('input[name="paymentChannel"]:checked').value;
                const paystackChannels = selectedChannel === 'mobile_money' ? ['mobile_money'] : ['card'];

                const paystackOptions = {
                    key: paystackPublicKey,
                    email: b.email,
                    amount: Math.round(Number(b.deposit) * 100), // convert GHS to pesewas (minor units)
                    currency: 'GHS',
                    channels: paystackChannels,
                    reference: b.id + '_' + Date.now(), // unique checkout transaction reference
                    callback: async function(paystackResponse) {
                        btnSubmitBooking.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying Payment...';
                        try {
                            // Verify payment on backend
                            const verifyRes = await fetch(`/api/bookings/${b.id}/verify-payment`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ reference: paystackResponse.reference })
                            });
                            const verifyData = await verifyRes.json();

                            if (!verifyRes.ok) {
                                throw new Error(verifyData.error || 'Payment verification failed.');
                            }

                            // Populate success modal with updated confirmed booking
                            const updatedBooking = verifyData.booking;
                            successBookingId.textContent = updatedBooking.id;
                            successName.textContent = updatedBooking.name;
                            successDeposit.textContent = `GHC ${Number(updatedBooking.deposit).toLocaleString()}`;
                            successBalance.textContent = `GHC ${Number(updatedBooking.balance).toLocaleString()}`;
                            successDueDate.textContent = updatedBooking.balanceDueDate;

                            // Show success modal
                            successModal.classList.add('active');
                        } catch (verifyErr) {
                            alert(`Verification failed: ${verifyErr.message}\nYour booking request was created (ID: ${b.id}). Please contact support with this ID and reference: ${paystackResponse.reference} to verify.`);
                        } finally {
                            btnSubmitBooking.disabled = false;
                            btnSubmitBooking.innerHTML = 'Secure Deposit Payment & Book <i class="fa-solid fa-lock" style="margin-left:6px;"></i>';
                        }
                    },
                    onClose: function() {
                        alert(`Checkout closed. Your booking request (ID: ${b.id}) is saved as PENDING. Contact support to finalize deposit payment.`);
                        btnSubmitBooking.disabled = false;
                        btnSubmitBooking.innerHTML = 'Secure Deposit Payment & Book <i class="fa-solid fa-lock" style="margin-left:6px;"></i>';
                    }
                };

                // Add subaccount routing if configured on server
                if (paystackSubaccount) {
                    paystackOptions.subaccount = paystackSubaccount;
                }

                const handler = PaystackPop.setup(paystackOptions);

                handler.openIframe();

            } catch (err) {
                alert(`Checkout transaction failed: ${err.message}`);
                btnSubmitBooking.disabled = false;
                btnSubmitBooking.innerHTML = 'Secure Deposit Payment & Book <i class="fa-solid fa-lock" style="margin-left:6px;"></i>';
            }
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            successModal.classList.remove('active');
            
            // Reset Wizard & Forms
            setStep(1);
            
            document.getElementById('formName').value = '';
            document.getElementById('formEmail').value = '';
            document.getElementById('formPhone').value = '';
            document.getElementById('formInstagram').value = '';
            document.getElementById('formNotes').value = '';
            
            formGuests.value = '';
            formPackage.value = '';
            formDate.value = '';
            policyAgreement.checked = false;

            calendarWarn.textContent = 'Select an open, highlighted date grid slot.';
            calendarWarn.className = 'form-help text-warning';

            fetchAvailability(); // Re-sync blocked dates
        });
    }


    // ----------------------------------------------------------------------
    // 8. Scroll Reveal Animations (Intersection Observer)
    // ----------------------------------------------------------------------
    const revealElements = document.querySelectorAll('.scroll-reveal');

    if (revealElements.length > 0 && 'IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    // Once revealed, stop observing for performance
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            root: null,
            rootMargin: '0px 0px -80px 0px', // trigger 80px before fully in view
            threshold: 0.12
        });

        revealElements.forEach(el => revealObserver.observe(el));
    } else {
        // Fallback: show everything immediately if no observer support
        revealElements.forEach(el => el.classList.add('revealed'));
    }
});
