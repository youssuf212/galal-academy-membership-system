import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { LogOut, UploadCloud, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Admin() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Dashboard state
  const [members, setMembers] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchMembers();
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchMembers();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setMembers(data);
    }
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
          // Process the CSV data into our database schema
          // Assuming the YouTube CSV has something like 'Member', 'Member since', 'Tier'
          // We will map headers loosely, adjust these based on the exact YouTube CSV output.
          
          setUploadMessage(`Processing ${results.data.length} records...`);

          const processedMembers = results.data.map((row: any) => ({
             // We'll try to find common YouTube CSV header names, but may need adjustment
             name: row['Member'] || row['Name'] || row['Profile Name'] || 'Unknown',
             youtube_handle: row['Channel URL'] ? row['Channel URL'].split('/').pop() : 'Unknown',
             tier: row['Level'] || row['Tier'] || 'Standard',
             status: row['Status'] === 'Active' ? 'active' : 'inactive', // Replace with whatever youtube sends
          })).filter(m => m.youtube_handle !== 'Unknown');

          // Upsert data to supabase
          const { error } = await supabase
            .from('members')
            .upsert(processedMembers, { onConflict: 'youtube_handle' });

          if (error) throw error;

          setUploadStatus('success');
          setUploadMessage('Successfully synced members database!');
          fetchMembers(); // refresh table

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
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-50">Loading...</div>;
  }

  // --- LOGIN VIEW ---
  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Admin Portal</h1>
            <p className="text-zinc-400 mt-2 text-sm">Sign in to manage members.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-zinc-400 text-sm mt-1">Manage YouTube Memberships and Automations</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Widget */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UploadCloud className="w-5 h-5" />
                Sync YouTube CSV
              </h2>
              
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-blue-500 bg-blue-500/10" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
                )}
              >
                <input {...getInputProps()} />
                <UploadCloud className="w-8 h-8 mx-auto text-zinc-500 mb-4" />
                <p className="text-sm text-zinc-300">
                  Drag & drop the YouTube members CSV here, or click to select file.
                </p>
              </div>

              {/* Upload Status */}
              {uploadStatus !== 'idle' && (
                <div className={cn(
                  "mt-4 p-4 rounded-xl flex items-start gap-3 text-sm",
                  uploadStatus === 'processing' && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                  uploadStatus === 'success' && "bg-green-500/10 text-green-400 border border-green-500/20",
                  uploadStatus === 'error' && "bg-red-500/10 text-red-400 border border-red-500/20",
                )}>
                  {uploadStatus === 'processing' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
                  {uploadStatus === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                  {uploadStatus === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
                  <p>{uploadMessage}</p>
                </div>
              )}
            </div>
          </div>

          {/* Members Table */}
          <div className="lg:col-span-2">
             <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col h-[600px]">
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Member Database ({members.length})
                  </h2>
                  <button onClick={fetchMembers} className="text-sm text-blue-400 hover:text-blue-300">
                    Refresh
                  </button>
                </div>
                
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-zinc-950/50 sticky top-0 border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-4 font-medium text-zinc-400">Name</th>
                        <th className="px-6 py-4 font-medium text-zinc-400">YouTube Handle</th>
                        <th className="px-6 py-4 font-medium text-zinc-400">Tier</th>
                        <th className="px-6 py-4 font-medium text-zinc-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {members.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                            No members found. Upload a CSV to sync.
                          </td>
                        </tr>
                      ) : (
                        members.map((member) => (
                          <tr key={member.id} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-3">{member.name}</td>
                            <td className="px-6 py-3 font-mono text-xs">{member.youtube_handle}</td>
                            <td className="px-6 py-3">
                              <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-xs font-medium">
                                {member.tier}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-xs font-medium",
                                member.status === 'active' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                              )}>
                                {member.status}
                              </span>
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
