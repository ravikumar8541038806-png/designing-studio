/**
 * IndexedDB draft persistence for ClientForge Studio.
 * Stores large documents and carousels (including embedded HD images and
 * uploaded artwork) without hitting localStorage's ~5 MB quota limit.
 * Falls back gracefully to localStorage in restricted environments.
 */

const DB_NAME = 'clientforge-studio-db'
const DB_VERSION = 1
const STORE_NAME = 'drafts'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
  })
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    const result = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
    if (result !== null) return result
  } catch {
    /* fall back to localStorage below */
  }
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
    return
  } catch {
    /* fall back to localStorage below */
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage quota exceeded or blocked */
  }
}
