import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import LandingPage from './pages/LandingPage'
import MonitorPage from './pages/MonitorPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
      </Route>
    </Routes>
  )
}
