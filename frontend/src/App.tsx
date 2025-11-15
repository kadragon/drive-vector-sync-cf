import { useState, useEffect } from 'react'

function App() {
  const [healthStatus, setHealthStatus] = useState<string>('Checking...')

  useEffect(() => {
    // Test API connectivity
    fetch('/health')
      .then(res => res.json())
      .then(data => {
        setHealthStatus(`Worker Status: ${data.status}`)
      })
      .catch(err => {
        setHealthStatus(`Error: ${err.message}`)
      })
  }, [])

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl">Drive Vector Sync Dashboard</a>
        </div>
        <div className="flex-none">
          <label className="swap swap-rotate btn btn-ghost btn-circle">
            <input type="checkbox" className="theme-controller" value="dark" />
            <svg className="swap-off fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
            </svg>
            <svg className="swap-on fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/>
            </svg>
          </label>
        </div>
      </div>

      <div className="container mx-auto p-6">
        <div className="hero bg-base-100 shadow-xl rounded-box p-8 mb-6">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className="text-5xl font-bold">Welcome to Drive Sync</h1>
              <p className="py-6">
                Monitor your Google Drive to Vectorize sync status in real-time.
              </p>
              <div className="badge badge-lg badge-primary">{healthStatus}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat bg-base-100 shadow-xl rounded-box">
            <div className="stat-title">Last Sync</div>
            <div className="stat-value text-primary">--</div>
            <div className="stat-desc">Waiting for data...</div>
          </div>

          <div className="stat bg-base-100 shadow-xl rounded-box">
            <div className="stat-title">Files Processed</div>
            <div className="stat-value text-secondary">0</div>
            <div className="stat-desc">Total files synced</div>
          </div>

          <div className="stat bg-base-100 shadow-xl rounded-box">
            <div className="stat-title">Vector Count</div>
            <div className="stat-value">0</div>
            <div className="stat-desc">Embeddings stored</div>
          </div>

          <div className="stat bg-base-100 shadow-xl rounded-box">
            <div className="stat-title">Errors</div>
            <div className="stat-value text-error">0</div>
            <div className="stat-desc">No errors detected</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
