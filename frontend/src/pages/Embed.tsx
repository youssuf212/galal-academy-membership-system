import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Loader2, Youtube } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Embed() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    youtubeName: ''
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success_verified' | 'success_pending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [memberTier, setMemberTier] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      // 1. Search if this youtube name exists in the members table
      const { data: member } = await supabase
        .from('members')
        .select('*')
        .ilike('name', formData.youtubeName)
        .single();

      if (member) {
        // MATCH FOUND
        // Insert into verifications table as verified
        const { error: verificationError } = await supabase
          .from('verifications')
          .insert([{
            member_id: member.id,
            email: formData.email,
            youtube_handle: formData.youtubeName,
            status: 'verified',
            verified_at: new Date().toISOString()
          }]);
        
        if (verificationError && verificationError.code === '23505') {
            throw new Error("This YouTube Name has already been verified.");
        }
        
        setMemberTier(member.tier);
        setStatus('success_verified');
        
        const joinDateObj = new Date(member.joined_at || Date.now());
        const renewalDateObj = new Date(member.joined_at || Date.now());
        renewalDateObj.setMonth(renewalDateObj.getMonth() + 1);

        // Trigger edge function
        supabase.functions.invoke('dispatch-email', {
          body: { 
            type: 'welcome', 
            email: formData.email, 
            name: member.name, 
            tier: member.tier,
            join_date: joinDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            renewal_date: renewalDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          }
        }).catch(console.error);
      } else {
        // NO MATCH FOUND - Insert as Pending
        const { error: verificationError } = await supabase
          .from('verifications')
          .insert([{
            email: formData.email,
            youtube_handle: formData.youtubeName, // Store submitted name here
            status: 'pending'
          }]);
        
        if (verificationError && verificationError.code === '23505') {
            throw new Error("A request for this YouTube Name is already pending.");
        }
        
        setStatus('success_pending');

        // Trigger edge function
        supabase.functions.invoke('dispatch-email', {
          body: { type: 'pending', email: formData.email, name: formData.youtubeName }
        }).catch(console.error);
      }
      
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  if (status === 'success_verified') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-950 min-h-screen text-zinc-50 font-sans">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Thank you for being a member!</h2>
        <p className="text-zinc-400 max-w-sm mb-6">
          Hello {formData.name}, we are provisioning your <strong>{memberTier}</strong> access right now. You will receive an email shortly with your Google Drive and Slack invitations.
        </p>
        <p className="text-sm text-zinc-500">Need help? Contact <a href="mailto:agytmembers@gmail.com" className="text-blue-400 hover:underline">agytmembers@gmail.com</a></p>
      </div>
    );
  }

  if (status === 'success_pending') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-950 min-h-screen text-zinc-50 font-sans">
        <Loader2 className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Request Received!</h2>
        <p className="text-zinc-400 max-w-sm mb-6">
          Your request is currently being reviewed and will be updated shortly once our member database syncs. 
          We'll send an update to <strong>{formData.email}</strong> as soon as you're verified.
        </p>
        <p className="text-sm text-zinc-500">Need help? Contact <a href="mailto:agytmembers@gmail.com" className="text-blue-400 hover:underline">agytmembers@gmail.com</a></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-red-500/10 text-red-500 mb-4">
            <Youtube className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Member Verification</h1>
          <p className="text-zinc-400 mt-2 text-sm">
            Enter your details below to unlock your exclusive Slack and Google Drive access.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-red-500 transition-colors"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-red-500 transition-colors"
              placeholder="john@example.com"
            />
            <p className="text-xs text-zinc-500 mt-1">
              We will use this to send your Slack and Google Drive invites.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">YouTube Profile Name</label>
            <input
              type="text"
              required
              value={formData.youtubeName}
              onChange={(e) => setFormData(prev => ({ ...prev, youtubeName: e.target.value }))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-red-500 transition-colors"
              placeholder="e.g. Hamed Y"
            />
            <p className="text-xs text-zinc-500 mt-1">
              The exact name you use on your YouTube profile.
            </p>
          </div>

          {status === 'error' && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className={cn(
              "w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2",
              status === 'loading' && "opacity-70 cursor-not-allowed"
            )}
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Membership'
            )}
          </button>

          <p className="text-center text-xs text-slate-500 mt-6 border-t border-slate-200 pt-6">
            Need support? Email us at <a href="mailto:agytmembers@gmail.com" className="text-blue-600 hover:underline">agytmembers@gmail.com</a>
          </p>
        </form>
      </div>
    </div>
  );
}
