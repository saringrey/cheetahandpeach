import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../../store/gameStore'
import {
  autoQuality,
  resolveProfile,
  type AutoTier,
  type QualityProfile,
} from './quality'
import type { Settings } from '../../types'

interface ActiveQualityProfile {
  settings: Settings
  tier: AutoTier
  profile: QualityProfile
}

/**
 * One reactive view of the effective quality profile.
 *
 * AutoQuality deliberately lives outside React because it samples frame time.
 * This hook is the small bridge that lets infrequently-changing quality tiers
 * resize foliage and particle pools instead of only changing the debug label.
 */
export function useQualityProfile(): ActiveQualityProfile {
  const settings = useGame((state) => state.settings)
  const [tier, setTier] = useState<AutoTier>(autoQuality.current)

  useEffect(() => {
    const onChange = (next: AutoTier) => setTier(next)
    autoQuality.onChange.push(onChange)
    return () => {
      const index = autoQuality.onChange.indexOf(onChange)
      if (index >= 0) autoQuality.onChange.splice(index, 1)
    }
  }, [])

  const profile = useMemo(() => resolveProfile(settings, tier), [settings, tier])
  return { settings, tier, profile }
}
