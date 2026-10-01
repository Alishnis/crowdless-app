import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import LandingPage from './pages/LandingPage'
import MonitorPage from './pages/MonitorPage'
import UserPage from './pages/UserPage'
import LabPage from './pages/LabPage'
import MethodPage from './pages/MethodPage'

export default function App() {
  return (
    <Routes>
      {/* User-facing map — full screen, no navbar */}
      <Route path="/map" element={<UserPage />} />

      {/* Admin + landing — with shared navbar */}
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/lab/:methodId" element={<MethodPage />} />
      </Route>
    </Routes>
  )
}
