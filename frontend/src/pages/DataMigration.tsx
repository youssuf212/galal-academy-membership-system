import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Database, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function DataMigration() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      setIsAuthenticated(true);
    } else {
      alert('Invalid credentials');
    }
  };

  const downloadFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportData = async () => {
    setStatus('loading');
    setStatusMsg('Fetching members...');
    
    try {
      // Fetch members
      const { data: members, error: membersError } = await supabase.from('members').select('*');
      if (membersError) throw membersError;

      setStatusMsg('Fetching verifications...');
      
      // Fetch verifications
      const { data: verifications, error: verificationsError } = await supabase.from('verifications').select('*');
      if (verificationsError) throw verificationsError;

      setStatusMsg('Packaging data...');

      const exportObject = {
        members: members || [],
        verifications: verifications || [],
        exported_at: new Date().toISOString()
      };

      downloadFile('galal_academy_database_export.json', JSON.stringify(exportObject, null, 2));

      setStatus('success');
      setStatusMsg('Data downloaded successfully! You can find the JSON file in your downloads folder.');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setStatusMsg('Failed to export data: ' + err.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mb-4" />
            <h1 className="text-2xl font-bold tracking-tight">Data Migration</h1>
            <p className="text-slate-400 mt-2 text-sm">Secure terminal for database extraction.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-rose-500 transition-colors text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-rose-500 transition-colors text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-medium py-3 rounded-xl transition-colors mt-2"
            >
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-slate-700 bg-slate-800/50 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Database className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Migration Terminal</h1>
            <p className="text-slate-400 text-sm mt-1">Export raw table data for database transfer.</p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
               Data Packet
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Clicking the button below will instruct the client to pull <strong>every row</strong> from the <code>members</code> and <code>verifications</code> tables using the current Supabase Anon Key. It will be packaged into a single JSON file.
            </p>

            <button
              onClick={handleExportData}
              disabled={status === 'loading'}
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-3 text-lg"
            >
              {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {status === 'loading' ? 'Extracting Data...' : 'Download All Data'}
            </button>

            {status !== 'idle' && (
              <div className={cn(
                "mt-6 p-4 rounded-xl flex items-start gap-3 text-sm font-medium",
                status === 'loading' && "bg-slate-800 text-indigo-400 border border-indigo-500/30",
                status === 'success' && "bg-emerald-900/30 text-emerald-400 border border-emerald-500/30",
                status === 'error' && "bg-rose-900/30 text-rose-400 border border-rose-500/30"
              )}>
                {status === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                {status === 'error' && <ShieldAlert className="w-5 h-5 shrink-0" />}
                {status === 'loading' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
                <p>{statusMsg}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
