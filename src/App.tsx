import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Analytics, track } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { supabase } from './reminder/lib/supabase';

const LandingApp = lazy(() => import('./LandingApp'));
const ReminderApp = lazy(() => import('./reminder/ReminderApp'));
const RegisterApp = lazy(() => import('./components/RegisterApp'));

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
  const location = useLocation();
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  // Track page views on route changes for SPA navigation
  useEffect(() => {
    track('page_view', { path: location.pathname });
  }, [location.pathname]);

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

  let content;
  if (currentPath.startsWith('/reminder')) {
    content = <ReminderApp />;
  } else if (currentPath.startsWith('/register')) {
    content = <RegisterApp />;
  } else {
    content = <LandingApp />;
  }

  return (
    <>
      <Suspense
        fallback={
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#020617',
              color: '#38bdf8',
            }}
          >
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                border: '3px solid rgba(56, 189, 248, 0.2)',
                borderTopColor: '#38bdf8',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        }
      >
        {content}
      </Suspense>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
