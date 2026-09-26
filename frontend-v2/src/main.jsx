import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const packages = [
  { id: 'silver', name: 'Silver', guests: '70-100 guests', price: 'GHC 8,000', summary: 'A focused cocktail service for intimate celebrations.' },
  { id: 'gold', name: 'Gold', guests: '100-150 guests', price: 'GHC 9,500', summary: 'The balanced choice for a complete guest experience.', featured: true },
  { id: 'premium', name: 'Premium', guests: '150-200 guests', price: 'GHC 11,500', summary: 'Full-service hospitality for larger, high-touch events.' }
];

function App() {
  const [selectedPackage, setSelectedPackage] = useState('gold');
  const [blockedDates, setBlockedDates] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', date: '', guests: '' });
  const [status, setStatus] = useState({ type: '', message: '' });

  useEffect(() => {
    fetch('/api/availability').then((response) => response.json()).then(setBlockedDates).catch(() => setBlockedDates([]));
  }, []);

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const minimumDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const submitBooking = async (event) => {
    event.preventDefault();
    setStatus({ type: 'working', message: 'Sending your request...' });
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, packageType: selectedPackage, guests: Number(form.guests) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not save your request.');
      setStatus({ type: 'success', message: `Request received. Your booking ID is ${data.booking.id}.` });
      setForm({ name: '', email: '', phone: '', date: '', guests: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Mirage Cocktails home"><span className="mark">M</span> MIRAGE COCKTAILS</a>
        <nav><a href="#experience">Experience</a><a href="#packages">Packages</a><a className="nav-cta" href="#book">Check availability</a></nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Mobile bar service · Accra</p>
          <h1>Thoughtful drinks.<br /><em>Remarkable gatherings.</em></h1>
          <p className="hero-text">A polished cocktail experience for weddings, private dinners, launches, and celebrations that deserve considered hospitality.</p>
          <div className="hero-actions"><a className="button primary" href="#book">Plan your event <span aria-hidden="true">-&gt;</span></a><a className="text-link" href="#packages">View packages</a></div>
        </div>
        <div className="hero-art" aria-label="Mirage Cocktails service details"><div className="art-card"><span className="art-kicker">MIRAGE / 02</span><div className="glass-shape"><span>crafted<br />for your<br /><strong>moment</strong></span></div><div className="art-footer"><span>Signature service</span><span>Est. 2024</span></div></div></div>
      </section>

      <section className="experience section" id="experience"><div className="section-label">01 / The experience</div><div className="experience-grid"><h2>Hospitality that feels<br /><em>effortless.</em></h2><div><p className="large-copy">We bring the bar, the menu, and the calm expertise to make your event feel beautifully looked after.</p><div className="stat-row"><div><strong>70%</strong><span>deposit to secure your date</span></div><div><strong>14</strong><span>days minimum notice</span></div><div><strong>100%</strong><span>attention to detail</span></div></div></div></div></section>

      <section className="section packages" id="packages"><div className="section-heading"><div className="section-label">02 / Packages</div><h2>Choose your level<br /><em>of service.</em></h2></div><div className="package-grid">{packages.map((item) => <button className={`package ${item.featured ? 'featured' : ''} ${selectedPackage === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedPackage(item.id)}><span className="package-index">0{packages.indexOf(item) + 1}</span><span className="package-name">{item.name}</span><span className="package-guests">{item.guests}</span><span className="package-summary">{item.summary}</span><span className="package-price">{item.price}</span><span className="package-action">{selectedPackage === item.id ? 'Selected' : 'Select package'} <span aria-hidden="true">-&gt;</span></span></button>)}</div></section>

      <section className="section booking" id="book"><div className="booking-intro"><div className="section-label">03 / Your date</div><h2>Let us make it<br /><em>memorable.</em></h2><p>Tell us a little about your event. We will follow up with the next steps and availability.</p></div><form className="booking-form" onSubmit={submitBooking}><div className="form-heading"><span>Selected package</span><strong>{packages.find((item) => item.id === selectedPackage).name}</strong></div><label>Full name<input name="name" value={form.name} onChange={updateField} required placeholder="Your name" /></label><label>Email address<input name="email" type="email" value={form.email} onChange={updateField} required placeholder="you@example.com" /></label><label>Phone number<input name="phone" value={form.phone} onChange={updateField} required placeholder="Your phone number" /></label><div className="form-row"><label>Event date<input name="date" type="date" min={minimumDate} value={form.date} onChange={updateField} required /></label><label>Guests<input name="guests" type="number" min="1" max="1000" value={form.guests} onChange={updateField} required placeholder="100" /></label></div><button className="button primary" type="submit">Request this date <span aria-hidden="true">-&gt;</span></button>{status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}<p className="form-note">Your date is only confirmed after deposit payment and team approval.</p></form></section>

      <footer><a className="wordmark" href="#top"><span className="mark">M</span> MIRAGE COCKTAILS</a><span>Thoughtful drinks for remarkable gatherings.</span><a href="/">Open Version 1</a></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
