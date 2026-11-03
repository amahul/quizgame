import { MotionConfig } from 'framer-motion'
import { About } from './About'
import { Landing } from './Landing'
import { useRoute } from './router'
import { HostScreen } from '../host/HostScreen'
import { PlayerScreen } from '../player/PlayerScreen'

export function App() {
  const route = useRoute()
  // "user": Framer Motion skips movement animations when the OS asks for reduced motion.
  return <MotionConfig reducedMotion="user">{screenFor(route)}</MotionConfig>
}

function screenFor(route: ReturnType<typeof useRoute>) {
  switch (route) {
    case 'host':
      return <HostScreen />
    case 'play':
      return <PlayerScreen />
    case 'about':
      return <About />
    default:
      return <Landing />
  }
}
