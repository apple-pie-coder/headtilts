import { FormEvent, useState } from 'react';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus('sent');
      setName(''); setEmail(''); setSubject(''); setMessage('');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="contact-success">
        <p>Thank you for your message! We'll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <h2 className="contact-form-title">Send a Message</h2>
      {status === 'error' && (
        <div className="alert-error">Something went wrong. Please try again.</div>
      )}
      <div className="contact-field">
        <label htmlFor="cf-name">Name</label>
        <input id="cf-name" type="text" value={name}
          onChange={(e) => setName(e.target.value)} required disabled={status === 'sending'} />
      </div>
      <div className="contact-field">
        <label htmlFor="cf-email">Email</label>
        <input id="cf-email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required disabled={status === 'sending'} />
      </div>
      <div className="contact-field">
        <label htmlFor="cf-subject">Subject</label>
        <input id="cf-subject" type="text" value={subject}
          onChange={(e) => setSubject(e.target.value)} disabled={status === 'sending'} />
      </div>
      <div className="contact-field">
        <label htmlFor="cf-message">Message</label>
        <textarea id="cf-message" rows={6} value={message}
          onChange={(e) => setMessage(e.target.value)} required disabled={status === 'sending'} />
      </div>
      <button type="submit" className="contact-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}
