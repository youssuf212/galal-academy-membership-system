// (removed React import)
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Embed from './pages/Embed';
import Admin from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The Embeddable Widget for Wix */}
        <Route path="/embed" element={<Embed />} />
        
        {/* The Admin Dashboard */}
        <Route path="/admin" element={<Admin />} />
        
        {/* Redirect root to admin or embed by default */}
        <Route path="/" element={<Navigate to="/embed" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
