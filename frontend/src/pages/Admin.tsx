import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { LogOut, UploadCloud, CheckCircle2, AlertCircle, Loader2, Clock, Mail } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Admin() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Dashboard state
  const [members, setMembers] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'verified' | 'rejected' | 'revoked'>('pending');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [sweepStatus, setSweepStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('All');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchDashboardData();
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchDashboardData();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDashboardData = async () => {
    // Fetch all synced members
    const { data: membersData } = await supabase.from('members').select('*');
    if (membersData) setMembers(membersData);

    // Fetch all form verifications
    const { data: verificationsData } = await supabase
      .from('verifications')
      .select(`
        *,
        members (*)
      `)
      .order('created_at', { ascending: false });
      
    if (verificationsData) setVerifications(verificationsData);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleManualStatus = async (id: string, newStatus: string) => {
    if (!window.confirm(`Are you sure you want to change this member's status to ${newStatus}?`)) return;
    
    // Optimistic UI update
    setVerifications(prev => prev.map(v => v.id === id ? { ...v, status: newStatus } : v));
    
    const { error } = await supabase.from('verifications').update({ status: newStatus }).eq('id', id);
    if (error) {
      alert(error.message);
      fetchDashboardData(); // revert on error
    } else {
      // Optional: re-fetch to ensure fresh data
      fetchDashboardData();
    }
  };

  const runLifecycleSweep = async (isAuto = false) => {
    if (!isAuto && !window.confirm("Are you sure you want to run the Lifecycle Sweep? This will immediately delete expired member Drive permissions and send automated upsell emails!")) return 0;
    
    setSweepStatus('processing');
    let errors = 0;
    let emailsSent = 0;
    
    for (const v of verifications) {
      if (v.status !== 'verified' || !v.members) continue;
      
      const daysActive = Math.floor((new Date().getTime() - new Date(v.members.joined_at).getTime()) / (1000 * 3600 * 24));
      
      // Day ~29 Upsell
      if (daysActive >= 29 && daysActive < 32 && !v.members.day_29_sent) {
        try {
          await supabase.functions.invoke('dispatch-email', {
             body: { type: 'lifecycle-day-29', email: v.email, name: v.members.name, tier: v.members.tier }
          });
          await supabase.from('members').update({ day_29_sent: true }).eq('id', v.members.id);
          emailsSent++;
        } catch(e) { console.error(e); errors++; }
      }
      
      // Day 32+ Expiry & Revocation
      if (daysActive >= 32 && !v.members.day_32_sent) {
        try {
          await supabase.functions.invoke('dispatch-email', {
             body: { type: 'lifecycle-day-32', email: v.email, name: v.members.name, tier: v.members.tier }
          });
          await supabase.from('members').update({ day_32_sent: true }).eq('id', v.members.id);
          // Move to revoked status
          await supabase.from('verifications').update({ status: 'revoked' }).eq('id', v.id);
          emailsSent++;
        } catch(e) { console.error(e); errors++; }
      }
    }
    
    fetchDashboardData();
    if (errors > 0) {
      setSweepStatus('error');
      alert(`Sweep completed but encountered ${errors} errors. Check console.`);
    } else {
      setSweepStatus('success');
      alert(`Sweep completely successful! Automated ${emailsSent} lifecycle actions.`);
    }
    setTimeout(() => setSweepStatus('idle'), 5000);
    return emailsSent;
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadStatus('processing');
    setUploadMessage('Parsing CSV...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          setUploadMessage(`Processing ${results.data.length} records...`);

          const processedMembers = results.data.map((row: any) => {
             const link = row['Link to profile'] || '';
             const joinedAtRaw = row['Last update timestamp'] || row['Member since'] || row['Update time'] || new Date().toISOString();
             const joinedAt = new Date(joinedAtRaw);
             
             return {
               name: row['Member']?.trim() || 'Unknown',
               youtube_handle: link ? link.split('/').pop() : 'Unknown',
               tier: row['Current level'] || 'Standard',
               status: 'active',
               joined_at: !isNaN(joinedAt.getTime()) ? joinedAt.toISOString() : new Date().toISOString()
             };
          }).filter(m => m.name !== 'Unknown' && m.youtube_handle !== 'Unknown');

          // Upsert data to supabase
          const { error: upsertError } = await supabase
            .from('members')
            .upsert(processedMembers, { onConflict: 'youtube_handle' });

          if (upsertError) throw upsertError;
          setUploadMessage('Members synced. Checking pending requests...');

          // Fetch fresh members
          const { data: freshMembers } = await supabase.from('members').select('*');
          
          if (freshMembers) {
            // Find all pending verifications
            const { data: pending } = await supabase
              .from('verifications')
              .select('*')
              .eq('status', 'pending');

            if (pending && pending.length > 0) {
              for (const req of pending) {
                // req.youtube_handle stores their submitted YouTube Name right now
                const match = freshMembers.find(m => m.name.toLowerCase() === req.youtube_handle.toLowerCase());
                
                if (match) {
                  // Check if the timestamp in this CSV is actually fresh
                  const daysActive = Math.floor((new Date().getTime() - new Date(match.joined_at).getTime()) / (1000 * 3600 * 24));
                  
                  if (daysActive > 31) {
                    // They match the handle, but their payment is expired/not renewed.
                    await supabase.from('verifications').update({ 
                      status: 'rejected' 
                    }).eq('id', req.id);
                    
                    supabase.functions.invoke('dispatch-email', {
                      body: { type: 'expired', email: req.email, name: req.youtube_handle }
                    }).catch(console.error);
                  } else {
                    // Fresh payment!
                    await supabase.from('verifications').update({ 
                      status: 'verified', 
                      member_id: match.id,
                      verified_at: new Date().toISOString()
                    }).eq('id', req.id);
                    
                    const joinDateObj = new Date(match.joined_at || Date.now());
                    const renewalDateObj = new Date(match.joined_at || Date.now());
                    renewalDateObj.setMonth(renewalDateObj.getMonth() + 1);

                    // Trigger welcome email
                    supabase.functions.invoke('dispatch-email', {
                      body: { 
                        type: 'welcome', 
                        email: req.email, 
                        name: match.name, 
                        tier: match.tier,
                        join_date: joinDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                        renewal_date: renewalDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      }
                    }).catch(console.error);
                  }
                } else {
                  // Mark as rejected since they aren't in the new CSV either
                  await supabase.from('verifications').update({ 
                    status: 'rejected' 
                  }).eq('id', req.id);
                  
                  // Trigger email
                  supabase.functions.invoke('dispatch-email', {
                    body: { type: 'rejected', email: req.email, name: req.youtube_handle }
                  }).catch(console.error);
                }
              }
            }
          }

          setUploadStatus('success');
          setUploadMessage('Synced CSV! Performing auto-lifecycle check...');
          
          // AUTO-SYNC LIFECYCLE: Automatically run the sweep after CSV upload
          const sweptCount = await runLifecycleSweep(true);
          
          setUploadMessage(`Success! Synced members and processed ${sweptCount} automated lifecycle actions.`);
          fetchDashboardData();

        } catch (err: any) {
          console.error(err);
          setUploadStatus('error');
          setUploadMessage(err.message || 'Failed to sync database.');
        }
      },
      error: (error) => {
        setUploadStatus('error');
        setUploadMessage(error.message);
      }
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false
  });

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-900">Loading...</div>;
  }

  // --- LOGIN VIEW ---
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Admin Portal</h1>
            <p className="text-slate-500 mt-2 text-sm">Sign in to manage members.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-black hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Sign In
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-500">
            For support contact <a href="mailto:agytmembers@gmail.com" className="text-blue-600 hover:underline">agytmembers@gmail.com</a>
          </div>
        </div>
      </div>
    );
  }

  const filteredVerifications = verifications.filter(v => {
    if (v.status !== activeTab) return false;
    
    if (tierFilter !== 'All') {
      const vTier = v.members?.tier || '';
      if (!vTier.toLowerCase().includes(tierFilter.toLowerCase())) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.email.toLowerCase().includes(q) && !(v.members?.name || '').toLowerCase().includes(q) && !(v.youtube_handle || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    
    return true;
  });

  // --- DASHBOARD VIEW ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Manage YouTube Memberships and Automations</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Widget */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-slate-600" />
                Sync YouTube CSV
              </h2>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Uploading a fresh CSV will automatically approve matches from the Pending Queue and transition statuses accordingly.
              </p>
              
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />
                <UploadCloud className="w-8 h-8 mx-auto text-slate-400 mb-4" />
                <p className="text-sm text-slate-600 font-medium">
                  Drag & drop the CSV here
                </p>
                <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              </div>

              {/* Upload Status */}
              {uploadStatus !== 'idle' && (
                <div className={cn(
                  "mt-4 p-4 rounded-xl flex items-start gap-3 text-sm",
                  uploadStatus === 'processing' && "bg-blue-50 text-blue-700 border border-blue-100",
                  uploadStatus === 'success' && "bg-emerald-50 text-emerald-700 border border-emerald-100",
                  uploadStatus === 'error' && "bg-red-50 text-red-700 border border-red-100",
                )}>
                  {uploadStatus === 'processing' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
                  {uploadStatus === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                  {uploadStatus === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
                  <p>{uploadMessage}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 mt-4 shadow-sm">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-slate-800">
                <Clock className="w-5 h-5 text-indigo-600" />
                Lifecycle Automation
              </h2>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Run a sweeping pass across all members. Anyone exceeding 31 active days will lose Drive permissions and receive a fallback discount. Day 29+ members will get an upsell retention sequence.
              </p>
              <button
                onClick={() => runLifecycleSweep(false)}
                disabled={sweepStatus === 'processing'}
                className="w-full py-2.5 px-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sweepStatus === 'processing' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : 'Run Action Sweep'}
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 mt-4 text-center shadow-sm">
              <p className="text-sm text-slate-600">
                Support: <a href="mailto:agytmembers@gmail.com" className="text-blue-600 hover:underline">agytmembers@gmail.com</a>
              </p>
              <p className="text-xs mt-2 text-slate-400">Total Members Synced: {members.length}</p>
            </div>
          </div>

          {/* Verification Table */}
          <div className="lg:col-span-2">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                <div className="border-b border-slate-200">
                  <div className="flex gap-4 px-6 pt-4">
                    <button 
                      onClick={() => setActiveTab('pending')}
                      className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === 'pending' ? "border-amber-500 text-amber-600" : "border-transparent text-slate-500 hover:text-slate-900")}
                    >
                      <Clock className="w-4 h-4" />
                      Pending Requests ({verifications.filter(v => v.status === 'pending').length})
                    </button>
                    <button 
                      onClick={() => setActiveTab('verified')}
                      className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === 'verified' ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-900")}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Verified Access ({verifications.filter(v => v.status === 'verified').length})
                    </button>
                    <button 
                      onClick={() => setActiveTab('rejected')}
                      className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === 'rejected' ? "border-red-500 text-red-600" : "border-transparent text-slate-500 hover:text-slate-900")}
                    >
                      <AlertCircle className="w-4 h-4" />
                      Rejected
                    </button>
                    <button 
                      onClick={() => setActiveTab('revoked')}
                      className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === 'revoked' ? "border-slate-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900")}
                    >
                      <LogOut className="w-4 h-4" />
                      Revoked ({verifications.filter(v => v.status === 'revoked').length})
                    </button>
                  </div>
                  
                  {/* Filters Bar */}
                  <div className="flex flex-wrap gap-4 px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                    <input 
                      type="text" 
                      placeholder="Search email or name..." 
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg w-full max-w-xs outline-none focus:border-blue-500"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select 
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value)}
                    >
                      <option value="All">All Tiers</option>
                      <option value="Elite">Elite</option>
                      <option value="Platinum">Platinum</option>
                      <option value="Gold">Gold</option>
                      <option value="Personal Coaching">Personal Coaching</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-medium text-slate-600">Email</th>
                        <th className="px-6 py-4 font-medium text-slate-600">YouTube Name</th>
                        <th className="px-6 py-4 font-medium text-slate-600">Joined CSV Date</th>
                        {activeTab === 'verified' && (
                          <>
                            <th className="px-6 py-4 font-medium text-slate-600">Tier</th>
                            <th className="px-6 py-4 font-medium text-slate-600">Days Active</th>
                          </>
                        )}
                        <th className="px-6 py-4 font-medium text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredVerifications.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                            No {activeTab} requests found.
                          </td>
                        </tr>
                      ) : (
                        filteredVerifications.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-slate-900">{req.email}</td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {req.members ? req.members.name : req.youtube_handle}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {req.members?.joined_at ? new Date(req.members.joined_at).toLocaleDateString() : new Date(req.created_at).toLocaleDateString()}
                            </td>
                            {activeTab === 'verified' && (
                              <>
                                <td className="px-6 py-4">
                                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                                    {req.members?.tier || 'Unknown'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm">
                                  {req.members?.joined_at ? Math.floor((new Date().getTime() - new Date(req.members.joined_at).getTime()) / (1000 * 3600 * 24)) : 0} days
                                </td>
                              </>
                            )}
                            <td className="px-6 py-4 flex items-center gap-2">
                              <a 
                                href={`mailto:${req.email}`}
                                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-black bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Email
                              </a>
                              {req.status === 'verified' ? (
                                <button 
                                  onClick={() => handleManualStatus(req.id, 'rejected')}
                                  className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-red-200"
                                >
                                  Revoke Access
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleManualStatus(req.id, 'verified')}
                                  className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-emerald-200"
                                >
                                  Approve
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
