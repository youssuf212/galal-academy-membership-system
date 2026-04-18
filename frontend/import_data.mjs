import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://xdeyrehlsawntfpiwxfb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZXlyZWhsc2F3bnRmcGl3eGZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzAzODIsImV4cCI6MjA5MTg0NjM4Mn0.Gsji-JlwPcMfpSOYlEporE9NNjFxCQZ6E8q8-JSYa-0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const jsonPath = path.join(__dirname, '..', 'galal_academy_database_export.json');
  if (!fs.existsSync(jsonPath)) {
    console.error("JSON export file not found at " + jsonPath);
    return;
  }
  
  console.log("Reading data file...");
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (data.members && data.members.length > 0) {
    console.log(`Inserting ${data.members.length} members in batches...`);
    // Insert in batches of 500 to avoid payload size limits
    for (let i = 0; i < data.members.length; i += 500) {
      const chunk = data.members.slice(i, i + 500).map(m => {
        const { created_at, email, ...cleaned } = m;
        return cleaned;
      });
      const { error } = await supabase.from('members').upsert(chunk);
      if (error) {
        console.error("Failed to insert member chunk:", error);
        return;
      }
    }
    console.log("✅ Members inserted successfully!");
  }

  if (data.verifications && data.verifications.length > 0) {
    const validMemberIds = new Set(data.members.map(m => m.id));
    console.log(`Inserting ${data.verifications.length} verifications in batches...`);
    for (let i = 0; i < data.verifications.length; i += 500) {
      const chunk = data.verifications.slice(i, i + 500).map(v => {
        if (v.member_id && !validMemberIds.has(v.member_id)) {
           v.member_id = null; 
        }
        return v;
      });
      const { error } = await supabase.from('verifications').upsert(chunk);
      if (error) {
        console.error("Failed to insert verification chunk:", error);
        return;
      }
    }
    console.log("✅ Verifications inserted successfully!");
  }
  
  console.log("Migration complete!");
}

run();
