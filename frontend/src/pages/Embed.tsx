import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Loader2, Youtube, HelpCircle, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Embed() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    youtubeName: '',
    promoCode: ''
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success_verified' | 'success_pending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [memberTier, setMemberTier] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [confirmName, setConfirmName] = useState(false);
  const [handleWarningIgnored, setHandleWarningIgnored] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.youtubeName.trim().startsWith('@')) {
      setErrorMessage("Please type your channel name exactly, not your @handle.");
      setStatus('error');
      return;
    }

    const trimmedName = formData.youtubeName.trim();
    if (!trimmedName.includes(' ') && trimmedName === trimmedName.toLowerCase() && !handleWarningIgnored) {
      setErrorMessage("It looks like you typed a handle. Please type your exact Channel Name (which usually includes spaces and capital letters) as it appears on your profile. If you are SURE this is your exact channel name, click Verify Membership again to submit anyway.");
      setStatus('error');
      setHandleWarningIgnored(true);
      return;
    }

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
        // MATCH FOUND — check how old the Last update timestamp is
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(member.joined_at).getTime()) / (1000 * 3600 * 24)
        );

        if (daysSinceUpdate <= 31) {
          // FRESH MEMBERSHIP (0–31 days) — verify immediately
          const { error: verificationError } = await supabase
            .from('verifications')
            .insert([{
              member_id: member.id,
              email: formData.email,
              youtube_handle: formData.youtubeName,
              promo_code: formData.promoCode || null,
              status: 'verified',
              verified_at: new Date().toISOString()
            }]);
          
          if (verificationError && verificationError.code === '23505') {
              throw new Error("This YouTube Name has already been verified.");
          }
          
          setMemberTier(member.tier);
          setStatus('success_verified');
          
          let finalPromoCode = member.promo_code;
          let elitePromoRedeemed = member.elite_promo_redeemed;

          if (member.tier.toLowerCase().includes('gold') && !finalPromoCode) {
             const nameParts = member.name.split(' ');
             let initials = nameParts.length >= 2 
                ? (nameParts[0].substring(0, 2) + nameParts[1].substring(0, 2)).toUpperCase() 
                : member.name.substring(0, 4).toUpperCase();
             finalPromoCode = `${initials}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
             await supabase.from('members').update({ promo_code: finalPromoCode }).eq('id', member.id);
          }

          if (member.tier.toLowerCase().includes('elite') && formData.promoCode && !elitePromoRedeemed) {
             const { data: matchedMember } = await supabase.from('members').select('id').eq('promo_code', formData.promoCode).single();
             if (matchedMember) {
                await supabase.from('members').update({ elite_promo_redeemed: true }).eq('id', member.id);
                elitePromoRedeemed = true;
             }
          }

          const joinDateObj = new Date(member.joined_at || Date.now());
          const renewalDateObj = new Date(member.joined_at || Date.now());
          renewalDateObj.setMonth(renewalDateObj.getMonth() + 1);

          // Trigger welcome email + Drive invite
          supabase.functions.invoke('dispatch-email', {
            body: { 
              type: 'welcome', 
              email: formData.email, 
              name: member.name, 
              tier: member.tier,
              join_date: joinDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              renewal_date: renewalDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              promo_code: finalPromoCode,
              elite_promo_redeemed: elitePromoRedeemed
            }
          }).catch(console.error);
        } else {
          // EXPIRED MEMBERSHIP (>31 days) — put them in pending queue
          // When a new CSV is uploaded, their name will be re-checked:
          //   - If still >31 days → expired email
          //   - If now ≤31 days  → welcome email + access
          const { error: verificationError } = await supabase
            .from('verifications')
            .insert([{
              member_id: member.id,
              email: formData.email,
              youtube_handle: formData.youtubeName,
              promo_code: formData.promoCode || null,
              status: 'pending'
            }]);
          
          if (verificationError && verificationError.code === '23505') {
              throw new Error("A request for this YouTube Name is already pending.");
          }
          
          setStatus('success_pending');

          // Send pending verification email
          supabase.functions.invoke('dispatch-email', {
            body: { type: 'pending', email: formData.email, name: formData.youtubeName }
          }).catch(console.error);
        }
      } else {
        // NO MATCH FOUND AT ALL — Insert as Pending
        // When a new CSV is uploaded:
        //   - If name appears → give access + welcome email
        //   - If name still missing → rejection email
        const { error: verificationError } = await supabase
          .from('verifications')
          .insert([{
            email: formData.email,
            youtube_handle: formData.youtubeName,
            promo_code: formData.promoCode || null,
            status: 'pending'
          }]);
        
        if (verificationError && verificationError.code === '23505') {
            throw new Error("A request for this YouTube Name is already pending.");
        }
        
        setStatus('success_pending');

        // Trigger pending email
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
    const normalizedTier = memberTier.toLowerCase().trim();
    const isGold = normalizedTier.includes('gold');
    const isCoaching = normalizedTier.includes('personal coaching');

    let successMessage: string;
    if (isGold) {
      successMessage = `Hello ${formData.name}, your <strong>${memberTier}</strong> membership has been verified. Welcome to the community!`;
    } else if (isCoaching) {
      successMessage = `Hello ${formData.name}, we are provisioning your <strong>${memberTier}</strong> access right now. You will receive an email shortly with your Google Drive invitation and 1:1 coaching session details.`;
    } else {
      successMessage = `Hello ${formData.name}, we are provisioning your <strong>${memberTier}</strong> access right now. You will receive an email shortly with your Google Drive and Slack invitations.`;
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 min-h-screen text-slate-900 font-sans">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Thank you for being a member!</h2>
        <p className="text-slate-600 max-w-sm mb-6" dangerouslySetInnerHTML={{ __html: successMessage }} />
        <p className="text-sm text-slate-500">Need help? Contact <a href="mailto:agytmembers@gmail.com" className="text-blue-600 hover:underline">agytmembers@gmail.com</a></p>
      </div>
    );
  }

  if (status === 'success_pending') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 min-h-screen text-slate-900 font-sans">
        <Loader2 className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Request Received!</h2>
        <p className="text-slate-600 max-w-sm mb-6">
          Your request is currently being reviewed and will be updated shortly once our member database syncs. 
          We'll send an update to <strong>{formData.email}</strong> as soon as you're verified.
        </p>
        <p className="text-sm text-slate-500">Need help? Contact <a href="mailto:agytmembers@gmail.com" className="text-blue-600 hover:underline">agytmembers@gmail.com</a></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-slate-100 text-slate-700 mb-4">
            <Youtube className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Member Verification</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Enter your details below to unlock your exclusive Slack and Google Drive access.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 text-slate-900 transition-colors"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 text-slate-900 transition-colors"
              placeholder="john@example.com"
            />
            <p className="text-xs text-slate-500 mt-1">
              Please use a <strong className="text-slate-700">Gmail address</strong> — our files are hosted on Google Drive.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">YouTube Channel Name</label>
            <input
              type="text"
              required
              value={formData.youtubeName}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, youtubeName: e.target.value }));
                setHandleWarningIgnored(false);
                if (status === 'error') setStatus('idle');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 text-slate-900 transition-colors"
              placeholder="e.g. Galal Academy"
            />
            
            {/* Collapsible Help Section */}
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              How to find your channel name
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showHelp && "rotate-180")} />
            </button>

            {showHelp && (
              <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left">
                {/* Annotated YouTube Screenshot */}
                <div className="mb-3 rounded-lg overflow-hidden border border-slate-200">
                  <img 
                    src="/yt-channel-name-guide.png" 
                    alt="YouTube channel name location" 
                    className="w-full h-auto"
                  />
                </div>
                
                <p className="text-xs font-semibold text-slate-700 mb-2">How to get your YouTube channel name:</p>
                <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                  <li>Head to your profile on YouTube</li>
                  <li>Copy your <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium">channel name</span> (not the @handle)</li>
                  <li><strong>Don't paste a link</strong> — only paste the name itself</li>
                </ol>
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <span className="shrink-0">⚠️</span>
                  <span><strong>Important:</strong> To ensure access, please make sure you enter the name correctly.</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Promo Code (Optional)</label>
            <input
              type="text"
              value={formData.promoCode}
              onChange={(e) => setFormData(prev => ({ ...prev, promoCode: e.target.value.toUpperCase() }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 text-slate-900 transition-colors uppercase"
              placeholder="e.g. NAME-XXX"
            />
          </div>

          {status === 'error' && (
            <div className="p-4 rounded-xl bg-red-50 text-red-600 border border-red-100 text-sm">
              {errorMessage}
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer mt-4 mb-2">
            <input 
              type="checkbox" 
              className="mt-1 w-4 h-4 rounded text-blue-600"
              checked={confirmName}
              onChange={(e) => setConfirmName(e.target.checked)}
              required
            />
            <span className="text-sm text-slate-600">
              I confirm I have entered my <strong>exact Channel Name</strong> as it appears on my profile, not my handle.
            </span>
          </label>

          <button
            type="submit"
            disabled={status === 'loading' || !confirmName}
            className={cn(
              "w-full bg-black hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2",
              (status === 'loading' || !confirmName) && "opacity-70 cursor-not-allowed"
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
