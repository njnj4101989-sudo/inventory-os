import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send HttpOnly cookies with every request
})

// Auth endpoints that should NOT trigger the refresh interceptor
const AUTH_URLS = ['/auth/login', '/auth/refresh', '/auth/me', '/auth/logout']

function isAuthUrl(url) {
  return AUTH_URLS.some((u) => url?.endsWith(u))
}

// Handle 401 — attempt token refresh once, then logout
let isRefreshing = false
let failedQueue = []

const processQueue = (error, success = false) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve()
  })
  failedQueue = []
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Don't intercept auth endpoints — let them fail naturally
    if (isAuthUrl(originalRequest?.url)) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => client(originalRequest))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Refresh cookie is sent automatically (HttpOnly, path=/api/v1/auth)
        await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
        processQueue(null, true)
        return client(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError)
        // Refresh failed — session is dead
        // Only redirect if not already on login page
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

/** Base URL for non-axios connections (SSE EventSource). */
export function getBaseUrl() {
  return API_URL
}

/** WebSocket URL — converts http(s) to ws(s). */
export function getWsUrl() {
  const base = API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`
  return base.replace(/^http/, 'ws')
}

export default client
