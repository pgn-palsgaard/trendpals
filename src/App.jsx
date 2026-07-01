import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Briefs from './pages/Briefs';
import SubmitBrief from './pages/SubmitBrief';
import TrendLibrary from './pages/TrendLibrary';
import AgentActivity from './pages/AgentActivity';
import GNPD from './pages/GNPD';
import ThemeLibrary from './pages/ThemeLibrary';
import ThemeMatrix from './pages/ThemeMatrix';
import SMEReviewQueue from './pages/SMEReviewQueue';
import TrendHub from './pages/TrendHub';
import ReviewQueue from './pages/ReviewQueue';
import Reports from './pages/Reports';
import EmergingSignals from './pages/EmergingSignals';
import ReviewerLayout from './components/layout/ReviewerLayout';
import SMEReviewPortal from './pages/SMEReviewPortal';
import SubmitterLayout from './components/layout/SubmitterLayout';
import Profile from './pages/Profile';
import AccessGuide from './pages/AccessGuide';
import AccessGuideReview from './pages/AccessGuideReview';
import { Navigate, useLocation } from 'react-router-dom';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // Public access guide — reachable without login (e.g. by colleagues who haven't
  // registered yet). Rendered before any auth gating below.
  if (location.pathname === '/access' || location.pathname === '/access-review') {
    return (
      <Routes>
        <Route path="/access" element={<AccessGuide />} />
        <Route path="/access-review" element={<AccessGuideReview />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // SCENARIO A — role field exists on the user object.
  // Reviewer role: gated to the SME portal only. All other paths redirect to /review.
  const isReviewer = user?.role === 'reviewer';

  if (isReviewer) {
    return (
      <Routes>
        <Route path="/review" element={<ReviewerLayout><SMEReviewPortal /></ReviewerLayout>} />
        <Route path="*" element={<Navigate to="/review" replace />} />
      </Routes>
    );
  }

  // Submitter is the default experience for everyone who is not an admin or reviewer.
  // Newly invited users land here with role 'user' (or no role yet) — they are
  // treated as submitters and gated to the Submit Brief page and their own profile.
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <Routes>
        <Route path="/SubmitBrief" element={<SubmitterLayout><SubmitBrief /></SubmitterLayout>} />
        <Route path="/Profile" element={<SubmitterLayout><Profile /></SubmitterLayout>} />
        <Route path="*" element={<Navigate to="/SubmitBrief" replace />} />
      </Routes>
    );
  }

  // Render the main app
  return (
    <Routes>
      {/* SME portal — accessible to admins for preview; uses ReviewerLayout, not LayoutWrapper */}
      <Route path="/review" element={<ReviewerLayout><SMEReviewPortal /></ReviewerLayout>} />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Briefs" element={<LayoutWrapper currentPageName="Briefs"><Briefs /></LayoutWrapper>} />
      <Route path="/SubmitBrief" element={<SubmitBrief />} />
      <Route path="/TrendLibrary" element={<LayoutWrapper currentPageName="TrendLibrary"><TrendLibrary /></LayoutWrapper>} />
      <Route path="/AgentActivity" element={<LayoutWrapper currentPageName="AgentActivity"><AgentActivity /></LayoutWrapper>} />
      <Route path="/GNPD" element={<LayoutWrapper currentPageName="GNPD"><GNPD /></LayoutWrapper>} />
      <Route path="/ThemeLibrary" element={<LayoutWrapper currentPageName="ThemeLibrary"><ThemeLibrary /></LayoutWrapper>} />
      <Route path="/ThemeMatrix" element={<LayoutWrapper currentPageName="ThemeMatrix"><ThemeMatrix /></LayoutWrapper>} />
      <Route path="/SMEReviewQueue" element={<LayoutWrapper currentPageName="SMEReviewQueue"><SMEReviewQueue /></LayoutWrapper>} />
      <Route path="/TrendHub/:trendId" element={<LayoutWrapper currentPageName="TrendHub"><TrendHub /></LayoutWrapper>} />
      <Route path="/ReviewQueue" element={<LayoutWrapper currentPageName="ReviewQueue"><ReviewQueue /></LayoutWrapper>} />
      <Route path="/Reports" element={<LayoutWrapper currentPageName="Reports"><Reports /></LayoutWrapper>} />
      <Route path="/EmergingSignals" element={<LayoutWrapper currentPageName="EmergingSignals"><EmergingSignals /></LayoutWrapper>} />
      <Route path="/Profile" element={<LayoutWrapper currentPageName="Profile"><Profile /></LayoutWrapper>} />
      {/* Redirects for deprecated routes */}
      <Route path="/ChallengeLibrary" element={<Navigate to="/ReviewQueue" replace />} />
      <Route path="/TrendReport" element={<Navigate to="/Reports" replace />} />
      <Route path="/ValidationTracking" element={<Navigate to="/ReviewQueue" replace />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App