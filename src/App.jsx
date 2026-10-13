import { useState } from 'react'

export default function App() {
  const [message] = useState(
    typeof window !== 'undefined' && window.CONFIG?.API_URL
      ? 'Backend: ' + window.CONFIG.API_URL
      : 'Loading config...'
  )
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Project Frontend</h1>
      <p>{message}</p>
    </div>
  )
}
