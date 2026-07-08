import { useState, useEffect } from 'react';
import LandingApp from './LandingApp';
import ReminderApp from './reminder/ReminderApp';
import RegisterApp from './components/RegisterApp';

if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
  sessionStorage.setItem('triggerPasswordReset', 'true');
  if (!window.location.pathname.startsWith('/reminder')) {
    window.history.replaceState({}, document.title, '/reminder' + window.location.hash);
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for custom navigation changes and standard popstate events
    window.addEventListener('popstate', handleLocationChange);
    
    // Intercept pushState/replaceState
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  if (currentPath.startsWith('/reminder')) {
    return <ReminderApp />;
  }

  if (currentPath.startsWith('/register')) {
    return <RegisterApp />;
  }

  return <LandingApp />;
}
