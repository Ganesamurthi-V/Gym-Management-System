export function pushHelpText(state: 'denied' | 'ios-needs-install'): string {
  return state === 'denied'
    ? 'Notifications are blocked for GymFlow. Allow them in your browser or phone settings, then come back.'
    : 'On iPhone, tap Share, then Add to Home Screen, and open GymFlow from there to turn on notifications.'
}
