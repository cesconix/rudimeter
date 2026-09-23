import { Link } from '@tanstack/react-router'
import { SCORES } from '../data/scores'
import { libraryCards } from './library-cards'

// The library does not change while the app runs: the cards are computed once.
const CARDS = libraryCards(SCORES)

/** The library: one card per piece — its title, its book and page, its meter and its drawn bars. A tap opens the training screen. */
export function Library() {
  return (
    <main className="library">
      <nav className="row library__nav">
        <h1>Rudimeter</h1>
        <Link to="/settings">Settings</Link>
      </nav>
      <ul className="library__cards">
        {CARDS.map((c) => (
          <li key={c.id}>
            <Link to="/score/$id" params={{ id: c.id }} className="card">
              <span className="card__title">{c.title}</span>
              {c.source && <span className="card__source">{c.source}</span>}
              <span className="card__meta">
                {c.meter} · {c.bars} bars
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
