import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Console from './pages/Console'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/console" element={<Console />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
