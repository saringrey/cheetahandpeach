import { useState, useMemo } from 'react'
import { useGame } from '../store/gameStore'
import { MEMORIES } from '../content/memories'
import { CONSTELLATIONS } from '../content/constellations'
import { GIRL } from '../content/characters'
import { Emblem } from './Emblem'
import { audio } from '../systems/audio/audio'
import { chapterIndex } from '../game/save/save'

type TabId = 'journey' | 'memories' | 'stars' | 'last'

/**
 * The journal. Deliberately a keepsake rather than a menu: paper stock, a
 * page-turn on tab change, pressed-flower plates where a photograph would go.
 *
 * It never reveals the parking lot before she gets there — the final page stays
 * locked until the ending is complete.
 */
export function Journal() {
  const toggleJournal = useGame((s) => s.toggleJournal)
  const save = useGame((s) => s.save)
  const [tab, setTab] = useState<TabId>('memories')
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set())

  const tabs: { id: TabId; label: string }[] = [
    { id: 'journey', label: 'The journey' },
    { id: 'memories', label: 'Memories' },
    { id: 'stars', label: 'Constellations' },
    { id: 'last', label: save.endingComplete ? 'The beginning' : '· · ·' },
  ]

  const chapterProgress = useMemo(
    () => [
      { name: 'The morning', at: 0 },
      { name: 'The lantern town', at: 1 },
      { name: 'The memory forest', at: 2 },
      { name: 'The quiet water', at: 3 },
      { name: 'The long climb', at: 4 },
      { name: 'The way down', at: 5 },
    ],
    [],
  )
  const reached = chapterIndex(save.chapter)

  return (
    <div className="layer layer--menu">
      <div className="panel journal">
        <div className="panel__core journal__core">
          <div className="journal__tabs">
            <Emblem
              className=""
              stroke="#b08a70"
            />
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="journal__tab"
                data-on={tab === t.id}
                onClick={() => {
                  audio.cue('journal')
                  setTab(t.id)
                }}
              >
                {t.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button type="button" className="journal__tab" onClick={toggleJournal}>
              Close — J
            </button>
          </div>

          <div className="journal__page" key={tab}>
            {tab === 'journey' && (
              <>
                <h3 className="journal__heading">Where she has walked</h3>
                <div className="journal__meta">{GIRL.displayName}'s journal</div>
                {chapterProgress.map((c) => {
                  const done = reached > c.at
                  const here = reached === c.at
                  return (
                    <div className={`entry ${done || here ? '' : 'entry--locked'}`} key={c.name}>
                      <div className="entry__plate">
                        <span style={{ opacity: done ? 1 : here ? 0.7 : 0.3, fontSize: '1.4rem' }}>
                          {done ? '❦' : here ? '·' : '·'}
                        </span>
                      </div>
                      <div>
                        <h4 className="entry__title">{c.name}</h4>
                        <p className="entry__text">
                          {done ? 'Behind her now.' : here ? 'She is here.' : 'Not yet.'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {tab === 'memories' && (
              <>
                <h3 className="journal__heading">What she kept</h3>
                <div className="journal__meta">
                  {save.memories.length} of {MEMORIES.length} found
                </div>
                {MEMORIES.map((m) => {
                  const found = save.memories.includes(m.id)
                  return (
                    <div className={`entry ${found ? '' : 'entry--locked'}`} key={m.id}>
                      <div className="entry__plate">
                        {found && m.photo && !failedPhotos.has(m.id) ? (
                          <img
                            className={m.id === 'photograph' ? 'entry__photo--portrait' : undefined}
                            src={m.photo}
                            alt={m.photoAlt ?? ''}
                            onError={() => {
                              // A missing photograph is fine — fall back to the motif.
                              setFailedPhotos((current) => new Set(current).add(m.id))
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '1.5rem', opacity: found ? 0.75 : 0.3 }}>
                            {found ? SHAPE_GLYPH[m.shape] : '·'}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="entry__title">{found ? m.title : 'Not found yet'}</h4>
                        <p className="entry__text">
                          {found ? m.message : 'Somewhere along the way.'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {tab === 'stars' && (
              <>
                <h3 className="journal__heading">What she drew in the sky</h3>
                <div className="journal__meta">
                  {save.constellations.length} of {CONSTELLATIONS.length} drawn
                </div>
                {CONSTELLATIONS.map((c) => {
                  const done = save.constellations.includes(c.id)
                  return (
                    <div className={`entry ${done ? '' : 'entry--locked'}`} key={c.id}>
                      <div className="entry__plate">
                        <span style={{ fontSize: '1.4rem', opacity: done ? 0.8 : 0.3 }}>
                          {done ? '✦' : '·'}
                        </span>
                      </div>
                      <div>
                        <h4 className="entry__title">{done ? c.name : 'Still just stars'}</h4>
                        <p className="entry__text">{done ? c.message : 'Not yet joined.'}</p>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {tab === 'last' && (
              <>
                {save.endingComplete ? (
                  <>
                    <h3 className="journal__heading">The beginning</h3>
                    <div className="journal__meta">The last page</div>
                    <p className="entry__text" style={{ fontSize: '1.05rem' }}>
                      An ordinary parking lot. A car. And the moment I met you.
                    </p>
                    <p className="entry__text" style={{ marginTop: '1.2rem' }}>
                      The beginning was waiting for us all along.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="journal__heading">· · ·</h3>
                    <div className="journal__meta">Sealed</div>
                    <p className="entry__text">
                      The last page of the journal is folded over and tucked into itself. It is
                      not time yet.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const SHAPE_GLYPH: Record<string, string> = {
  flower: '❀',
  photo: '❑',
  ticket: '✂',
  musicbox: '♪',
  charm: '❤',
  shell: '◗',
}
