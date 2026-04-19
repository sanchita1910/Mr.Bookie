import { Fragment, useCallback, useEffect, useState } from 'react'
import './App.css'

/** Empty in dev (uses Vite proxy); set VITE_API_URL to your deployed API origin in production. */
const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const API = `${API_BASE}/api/books`
const READING_API = `${API_BASE}/api/reading`

function emptyForm() {
  return { title: '', author: '', published_year: '', isbn: '', rating: '', notes: '' }
}

export default function App() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newBook, setNewBook] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [searchAttempted, setSearchAttempted] = useState(false)
  const [savingOpenLibraryKey, setSavingOpenLibraryKey] = useState(null)

  const [insightLoadingId, setInsightLoadingId] = useState(null)
  const [insights, setInsights] = useState({})
  const [insightExpandedId, setInsightExpandedId] = useState(null)

  const [timePreset, setTimePreset] = useState('2-evenings')
  const [customMinutes, setCustomMinutes] = useState(180)
  const [moodPreference, setMoodPreference] = useState('match-shelf')
  const [nextLoading, setNextLoading] = useState(false)
  const [nextResult, setNextResult] = useState(null)

  const [similarLoadingId, setSimilarLoadingId] = useState(null)
  const [similarCache, setSimilarCache] = useState({})
  const [similarExpandedId, setSimilarExpandedId] = useState(null)
  const [similarInsightLoadingId, setSimilarInsightLoadingId] = useState(null)
  const [similarInsightText, setSimilarInsightText] = useState({})

  const [companionNudgeBookId, setCompanionNudgeBookId] = useState(null)
  const [companionExpandedId, setCompanionExpandedId] = useState(null)
  const [companionLoadingKey, setCompanionLoadingKey] = useState(null)
  const [companionTexts, setCompanionTexts] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(API)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      setBooks(await res.json())
    } catch (e) {
      setError(e.message || 'Failed to load books')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const body = {
      title: newBook.title.trim(),
      author: newBook.author.trim(),
      ...(newBook.published_year !== '' && {
        published_year: Number(newBook.published_year),
      }),
      ...(newBook.isbn.trim() && { isbn: newBook.isbn.trim() }),
      ...(newBook.rating !== '' && { rating: Number(newBook.rating) }),
      notes: newBook.notes,
    }
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not add book')
      return
    }
    if (data.id != null) setCompanionNudgeBookId(data.id)
    setNewBook(emptyForm())
    load()
  }

  function startEdit(book) {
    setEditingId(book.id)
    setEditDraft({
      title: book.title,
      author: book.author,
      published_year: book.published_year ?? '',
      isbn: book.isbn ?? '',
      rating: book.rating != null ? String(book.rating) : '',
      notes: book.notes ?? '',
    })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  async function saveEdit() {
    setError(null)
    const res = await fetch(`${API}/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editDraft.title.trim(),
        author: editDraft.author.trim(),
        published_year:
          editDraft.published_year === '' ? null : Number(editDraft.published_year),
        isbn: editDraft.isbn.trim() ? editDraft.isbn.trim() : null,
        rating: editDraft.rating === '' ? null : Number(editDraft.rating),
        notes: editDraft.notes,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not save')
      return
    }
    cancelEdit()
    load()
  }

  async function fetchInsight(book) {
    setInsightLoadingId(book.id)
    setError(null)
    try {
      const res = await fetch(`${API}/${book.id}/sentiment`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not analyze')
      setInsights((prev) => ({ ...prev, [book.id]: data }))
      setInsightExpandedId(book.id)
    } catch (e) {
      setError(e.message || 'Analysis failed')
    } finally {
      setInsightLoadingId(null)
    }
  }

  function closeInsight() {
    setInsightExpandedId(null)
  }

  async function fetchNextRead() {
    setNextLoading(true)
    setError(null)
    setNextResult(null)
    try {
      const body = {
        timePreset,
        moodPreference,
        ...(timePreset === 'custom' && { customMinutes: Number(customMinutes) }),
      }
      const res = await fetch(`${READING_API}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not suggest')
      setNextResult(data)
    } catch (e) {
      setError(e.message || 'Suggestion failed')
    } finally {
      setNextLoading(false)
    }
  }

  async function fetchSimilar(book) {
    setSimilarLoadingId(book.id)
    setError(null)
    try {
      const res = await fetch(`${API}/${book.id}/similar`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Similar titles failed')
      setSimilarCache((prev) => ({ ...prev, [book.id]: data }))
      setSimilarExpandedId(book.id)
    } catch (e) {
      setError(e.message || 'Similar titles failed')
    } finally {
      setSimilarLoadingId(null)
    }
  }

  function closeSimilar() {
    setSimilarExpandedId(null)
  }

  async function fetchSimilarInsight(book) {
    setSimilarInsightLoadingId(book.id)
    setError(null)
    try {
      const res = await fetch(`${API}/${book.id}/similar/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'AI insight failed')
      setSimilarInsightText((prev) => ({
        ...prev,
        [book.id]: data.narration,
      }))
    } catch (e) {
      setError(e.message || 'AI insight failed')
    } finally {
      setSimilarInsightLoadingId(null)
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this book?')) return
    setError(null)
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' })
    if (res.status === 204) {
      load()
      return
    }
    const data = await res.json().catch(() => ({}))
    setError(data.error || 'Could not delete')
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Enter a search term')
      return
    }
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults([])
    setSearchAttempted(false)
    try {
      const res = await fetch(
        `${API}/search?q=${encodeURIComponent(q)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSearchError(data.error || 'Search failed')
        return
      }
      setSearchResults(data.results ?? [])
      setSearchAttempted(true)
    } catch (err) {
      setSearchError(err.message || 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }

  async function saveFromOpenLibrary(hit) {
    setError(null)
    setSavingOpenLibraryKey(hit.openLibraryKey)
    try {
      const body = {
        title: hit.title,
        author: hit.author,
        ...(hit.published_year != null && { published_year: hit.published_year }),
        ...(hit.isbn && { isbn: hit.isbn }),
        ...(hit.openLibraryKey?.startsWith('/works/') && {
          open_library_key: hit.openLibraryKey,
        }),
      }
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save book')
        return
      }
      if (data.id != null) setCompanionNudgeBookId(data.id)
      load()
    } finally {
      setSavingOpenLibraryKey(null)
    }
  }

  function toggleCompanion(book) {
    setCompanionExpandedId((id) => (id === book.id ? null : book.id))
    setError(null)
  }

  function closeCompanion() {
    setCompanionExpandedId(null)
  }

  async function fetchCompanion(book, mode) {
    const key = `${book.id}-${mode}`
    setCompanionLoadingKey(key)
    setError(null)
    try {
      const res = await fetch(`${API}/${book.id}/companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Companion failed')
      setCompanionTexts((prev) => ({
        ...prev,
        [key]: { text: data.text, cached: data.cached },
      }))
    } catch (e) {
      setError(e.message || 'Companion failed')
    } finally {
      setCompanionLoadingKey(null)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Books</h1>
      </header>

      <section className="panel">
        <h2>Search Open Library</h2>
        <form className="search-bar" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Title, author, subject…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search books"
          />
          <button type="submit" disabled={searchLoading}>
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchError && <p className="error search-msg">{searchError}</p>}
        {searchAttempted &&
          !searchLoading &&
          searchResults.length === 0 &&
          !searchError && (
          <p className="muted search-msg">No results. Try different words.</p>
        )}
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((hit) => (
              <li key={hit.openLibraryKey} className="search-hit">
                {hit.thumbnail ? (
                  <img src={hit.thumbnail} alt="" className="search-thumb" />
                ) : (
                  <div className="search-thumb placeholder" aria-hidden />
                )}
                <div className="search-meta">
                  <div className="search-title">{hit.title}</div>
                  <div className="search-sub">
                    {hit.author}
                    {hit.published_year != null && ` · ${hit.published_year}`}
                    {hit.isbn && ` · ${hit.isbn}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="save-search"
                  disabled={savingOpenLibraryKey === hit.openLibraryKey}
                  onClick={() => saveFromOpenLibrary(hit)}
                >
                  {savingOpenLibraryKey === hit.openLibraryKey
                    ? 'Saving…'
                    : 'Save to library'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel coach-panel">
        <h2>What to read next</h2>
        <p className="coach-lede muted">
          A small solver scores your shelf by <strong>time budget</strong>,{' '}
          <strong>note mood</strong> (same lexicon as Mood), <strong>star rating</strong>, and{' '}
          <strong>page count</strong> from Open Library when the work is linked. Optional LLM copy
          narrates the winner—logic stays on the server.
        </p>
        <div className="coach-controls">
          <label>
            Time
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value)}
            >
              <option value="1-evening">1 evening (~2h)</option>
              <option value="2-evenings">2 evenings (~4h)</option>
              <option value="weekend">Weekend (~8h)</option>
              <option value="custom">Custom minutes</option>
            </select>
          </label>
          {timePreset === 'custom' && (
            <label>
              Minutes
              <input
                type="number"
                min={15}
                max={1440}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
              />
            </label>
          )}
          <label>
            Mood goal
            <select
              value={moodPreference}
              onChange={(e) => setMoodPreference(e.target.value)}
            >
              <option value="match-shelf">Match my shelf notes</option>
              <option value="lighter">Lighter / warmer</option>
              <option value="heavier">Heavier / more serious</option>
              <option value="any">Any mood</option>
            </select>
          </label>
          <button type="button" className="coach-run" onClick={fetchNextRead} disabled={nextLoading}>
            {nextLoading ? 'Scoring…' : 'Suggest next read'}
          </button>
        </div>
        {nextResult && (
          <div className="coach-result">
            <div className="coach-pick">
              <h3>{nextResult.pick.title}</h3>
              <p className="coach-meta">
                {nextResult.pick.author}
                {nextResult.pick.page_count != null && (
                  <> · ~{nextResult.pick.page_count} pages</>
                )}
                {nextResult.pick.rating != null && <> · {nextResult.pick.rating}/5</>}
              </p>
            </div>
            <ul className="coach-reasoning">
              {nextResult.reasoning?.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <dl className="coach-scores">
              <div>
                <dt>Page fit</dt>
                <dd>{nextResult.breakdown?.pageFit}</dd>
              </div>
              <div>
                <dt>Mood fit</dt>
                <dd>{nextResult.breakdown?.moodFit}</dd>
              </div>
              <div>
                <dt>Rating fit</dt>
                <dd>{nextResult.breakdown?.ratingFit}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{nextResult.breakdown?.total}</dd>
              </div>
            </dl>
            {nextResult.narration && (
              <blockquote className="coach-llm">{nextResult.narration}</blockquote>
            )}
            {nextResult.llmError && (
              <p className="error coach-llm-err">LLM: {nextResult.llmError}</p>
            )}
            {!nextResult.llmConfigured && (
              <p className="muted coach-hint">
                Set <code>OPENAI_API_KEY</code> on the backend for optional coach narration.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Add a book</h2>
        <form className="form-grid" onSubmit={handleAdd}>
          <label>
            Title *
            <input
              required
              value={newBook.title}
              onChange={(e) => setNewBook((b) => ({ ...b, title: e.target.value }))}
            />
          </label>
          <label>
            Author *
            <input
              required
              value={newBook.author}
              onChange={(e) => setNewBook((b) => ({ ...b, author: e.target.value }))}
            />
          </label>
          <label>
            Year
            <input
              type="number"
              value={newBook.published_year}
              onChange={(e) =>
                setNewBook((b) => ({ ...b, published_year: e.target.value }))
              }
            />
          </label>
          <label>
            ISBN
            <input
              value={newBook.isbn}
              onChange={(e) => setNewBook((b) => ({ ...b, isbn: e.target.value }))}
            />
          </label>
          <label>
            Rating
            <select
              value={newBook.rating}
              onChange={(e) => setNewBook((b) => ({ ...b, rating: e.target.value }))}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="form-span-full">
            Notes
            <textarea
              rows={2}
              value={newBook.notes}
              onChange={(e) => setNewBook((b) => ({ ...b, notes: e.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit">Add</button>
          </div>
        </form>
      </section>

      {error && <p className="error">{error}</p>}

      {companionNudgeBookId != null && (
        <div className="companion-nudge" role="status">
          <p>
            Book saved — want to yap about it? Use <strong>Yap</strong> on that row for discussion
            questions, one-line read-alikes, or an &ldquo;If you liked…&rdquo; blurb (cached per edit;
            needs <code>OPENAI_API_KEY</code>).
          </p>
          <button type="button" className="companion-nudge-dismiss" onClick={() => setCompanionNudgeBookId(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="panel">
        <h2>Library</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : books.length === 0 ? (
          <p className="muted">No books yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Year</th>
                  <th>ISBN</th>
                  <th className="col-rating">Rating</th>
                  <th className="col-notes">Notes</th>
                  <th className="col-insight">AI mood</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <Fragment key={book.id}>
                    <tr>
                      {editingId === book.id && editDraft ? (
                        <>
                          <td>
                            <input
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, title: e.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={editDraft.author}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, author: e.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="input-narrow"
                              value={editDraft.published_year}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  published_year: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={editDraft.isbn}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, isbn: e.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <select
                              className="input-rating"
                              value={editDraft.rating}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, rating: e.target.value }))
                              }
                            >
                              <option value="">—</option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="col-notes">
                            <textarea
                              rows={2}
                              className="notes-edit"
                              value={editDraft.notes}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, notes: e.target.value }))
                              }
                            />
                          </td>
                          <td className="col-insight">
                            <span className="muted" title="Save, then use Yap">
                              —
                            </span>
                          </td>
                          <td className="actions">
                            <button type="button" onClick={saveEdit}>
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{book.title}</td>
                          <td>{book.author}</td>
                          <td>{book.published_year ?? '—'}</td>
                          <td>{book.isbn ?? '—'}</td>
                          <td className="col-rating">
                            {book.rating != null ? `${book.rating}/5` : '—'}
                          </td>
                          <td
                            className="col-notes notes-display"
                            title={book.notes || undefined}
                          >
                            {book.notes || '—'}
                          </td>
                          <td className="col-insight">
                            <div className="insight-actions">
                              <button
                                type="button"
                                className="btn-insight"
                                disabled={insightLoadingId === book.id}
                                onClick={() => fetchInsight(book)}
                                title="Lexicon sentiment on notes + title"
                              >
                                {insightLoadingId === book.id ? '…' : '✨ Mood'}
                              </button>
                              <button
                                type="button"
                                className="btn-similar"
                                disabled={similarLoadingId === book.id}
                                onClick={() => fetchSimilar(book)}
                                title="Open Library: same subject or author"
                              >
                                {similarLoadingId === book.id ? '…' : '↗ Similar'}
                              </button>
                              <button
                                type="button"
                                className="btn-yap"
                                onClick={() => toggleCompanion(book)}
                                title="LLM: questions, read-alikes, If you liked…"
                              >
                                {companionExpandedId === book.id ? '▼ Yap' : '💬 Yap'}
                              </button>
                            </div>
                          </td>
                          <td className="actions">
                            <button type="button" onClick={() => startEdit(book)}>
                              Edit
                            </button>
                            <button type="button" className="danger" onClick={() => remove(book.id)}>
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                    {insightExpandedId === book.id &&
                      insights[book.id] &&
                      editingId !== book.id && (
                        <tr className="insight-row">
                          <td colSpan={8}>
                            <div className="insight-card">
                              <div className="insight-card-head">
                                <span className="insight-emoji" aria-hidden>
                                  {insights[book.id].emoji}
                                </span>
                                <div>
                                  <div className="insight-headline">{insights[book.id].headline}</div>
                                  <p className="insight-blurb">{insights[book.id].blurb}</p>
                                </div>
                                <button
                                  type="button"
                                  className="insight-close"
                                  onClick={closeInsight}
                                >
                                  Close
                                </button>
                              </div>
                              <div className="insight-stats">
                                <span>
                                  Score <strong>{insights[book.id].rawScore}</strong>
                                </span>
                                <span>
                                  Comparative <strong>{insights[book.id].comparative}</strong>
                                </span>
                              </div>
                              {(insights[book.id].positiveWords?.length > 0 ||
                                insights[book.id].negativeWords?.length > 0) && (
                                <div className="insight-words">
                                  {insights[book.id].positiveWords?.length > 0 && (
                                    <div>
                                      <span className="insight-label">Positive hits</span>
                                      <ul>
                                        {insights[book.id].positiveWords.map((w, i) => (
                                          <li key={`p-${i}-${w}`}>{w}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {insights[book.id].negativeWords?.length > 0 && (
                                    <div>
                                      <span className="insight-label">Negative hits</span>
                                      <ul>
                                        {insights[book.id].negativeWords.map((w, i) => (
                                          <li key={`n-${i}-${w}`}>{w}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                              <p className="insight-footnote">
                                On-device style lexicon model (AFINN-based). Best with a few sentences in
                                notes.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    {similarExpandedId === book.id &&
                      similarCache[book.id] &&
                      editingId !== book.id && (
                        <tr className="similar-row">
                          <td colSpan={8}>
                            <div className="similar-card">
                              <div className="similar-head">
                                <h4>
                                  Open Library picks
                                  <span className="similar-strategy">
                                    {' '}
                                    ({similarCache[book.id].strategy}
                                    {similarCache[book.id].label
                                      ? `: ${similarCache[book.id].label}`
                                      : ''}
                                    )
                                  </span>
                                </h4>
                                <button type="button" className="insight-close" onClick={closeSimilar}>
                                  Close
                                </button>
                              </div>
                              <ul className="similar-list">
                                {similarCache[book.id].candidates?.map((c) => (
                                  <li key={c.openLibraryKey}>
                                    <strong>{c.title}</strong>
                                    <span className="muted">
                                      {' '}
                                      — {c.author}
                                      {c.published_year != null && ` (${c.published_year})`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {similarCache[book.id].candidates?.length === 0 && (
                                <p className="muted">No candidates returned.</p>
                              )}
                              <div className="similar-ai">
                                <button
                                  type="button"
                                  className="coach-run"
                                  disabled={
                                    !similarCache[book.id].llmConfigured ||
                                    similarInsightLoadingId === book.id
                                  }
                                  onClick={() => fetchSimilarInsight(book)}
                                >
                                  {similarInsightLoadingId === book.id
                                    ? 'Writing…'
                                    : 'AI paragraph (why these)'}
                                </button>
                                {!similarCache[book.id].llmConfigured && (
                                  <span className="muted"> Needs OPENAI_API_KEY</span>
                                )}
                              </div>
                              {similarInsightText[book.id] && (
                                <blockquote className="coach-llm similar-llm">
                                  {similarInsightText[book.id]}
                                </blockquote>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    {companionExpandedId === book.id && editingId !== book.id && (
                      <tr className="companion-row">
                        <td colSpan={8}>
                          <div className="companion-card">
                            <div className="companion-head">
                              <h4>Reading companion</h4>
                              <button type="button" className="insight-close" onClick={closeCompanion}>
                                Close
                              </button>
                            </div>
                            <p className="companion-lede muted">
                              Uses your title, author, rating, and notes. Responses are cached until you
                              change those fields.
                            </p>
                            <div className="companion-modes">
                              <button
                                type="button"
                                className="companion-mode-btn"
                                disabled={companionLoadingKey === `${book.id}-discussion`}
                                onClick={() => fetchCompanion(book, 'discussion')}
                              >
                                {companionLoadingKey === `${book.id}-discussion`
                                  ? '…'
                                  : 'Discussion questions'}
                              </button>
                              <button
                                type="button"
                                className="companion-mode-btn"
                                disabled={companionLoadingKey === `${book.id}-readalikes`}
                                onClick={() => fetchCompanion(book, 'readalikes')}
                              >
                                {companionLoadingKey === `${book.id}-readalikes`
                                  ? '…'
                                  : 'Read-alikes (1 sentence)'}
                              </button>
                              <button
                                type="button"
                                className="companion-mode-btn"
                                disabled={companionLoadingKey === `${book.id}-if_you_liked`}
                                onClick={() => fetchCompanion(book, 'if_you_liked')}
                              >
                                {companionLoadingKey === `${book.id}-if_you_liked`
                                  ? '…'
                                  : 'If you liked…'}
                              </button>
                            </div>
                            {['discussion', 'readalikes', 'if_you_liked'].map((mode) => {
                              const ck = `${book.id}-${mode}`
                              const entry = companionTexts[ck]
                              if (!entry?.text) return null
                              return (
                                <div key={mode} className="companion-block">
                                  <div className="companion-block-label">
                                    {mode === 'discussion' && 'Discussion'}
                                    {mode === 'readalikes' && 'Read-alikes'}
                                    {mode === 'if_you_liked' && 'If you liked…'}
                                    {entry.cached && <span className="cached-pill">cached</span>}
                                  </div>
                                  <div className="companion-text">{entry.text}</div>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
