import { useState, useEffect } from 'react';
import LandingApp from './LandingApp';
import ReminderApp from './reminder/ReminderApp';
import RegisterApp from './components/RegisterApp';
import { supabase } from './reminder/lib/supabase';

if (typeof window !== 'undefined') {
  if (window.location.hash.includes('type=recovery')) {
    sessionStorage.setItem('triggerPasswordReset', 'true');
    if (!window.location.pathname.startsWith('/reminder')) {
      window.history.replaceState({}, document.title, '/reminder' + window.location.hash);
    }
  }

  const search = window.location.search;
  if (search.includes('lessonId=') || search.includes('intent=')) {
    if (!window.location.pathname.startsWith('/reminder')) {
      window.history.replaceState({}, document.title, '/reminder' + search + window.location.hash);
    }
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

  useEffect(() => {
    // If the user visits "/" and has "keep logged in" enabled, check session and resume to /reminder
    const keepLoggedIn = localStorage.getItem('nativo_keep_logged_in') !== 'false';
    const isLandingForced = window.location.search.includes('landing=true');
    if (keepLoggedIn && !isLandingForced && window.location.pathname === '/') {
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.user) {
          window.history.replaceState({}, document.title, '/reminder');
          setCurrentPath('/reminder');
        }
      });
    }
  }, []);

  if (currentPath.startsWith('/reminder')) {
    return <ReminderApp />;
  }

  if (currentPath.startsWith('/register')) {
    return <RegisterApp />;
  }

  return <LandingApp />;
}
