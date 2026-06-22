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
import ChallengeLibrary from './pages/ChallengeLibrary';
import TrendReport from './pages/TrendReport';
import ThemeLibrary from './pages/ThemeLibrary';
import ThemeMatrix from './pages/ThemeMatrix';
import SMEReviewQueue from './pages/SMEReviewQueue';
import ValidationTracking from './pages/ValidationTracking';
import TrendHub from './pages/TrendHub';
import ReviewQueue from './pages/ReviewQueue';
import { Navigate } from 'react-router-dom';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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

  // Reviewer role: gate all routes, only allow SMEReviewQueue
  const isReviewer = user?.role === 'reviewer';

  if (isReviewer) {
    return (
      <Routes>
        <Route path="/SMEReviewQueue" element={<LayoutWrapper currentPageName="SMEReviewQueue"><SMEReviewQueue /></LayoutWrapper>} />
        <Route path="*" element={<Navigate to="/SMEReviewQueue" replace />} />
      </Routes>
    );
  }

  // Render the main app
  return (
    <Routes>
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
      <Route path="/ChallengeLibrary" element={<LayoutWrapper currentPageName="ChallengeLibrary"><ChallengeLibrary /></LayoutWrapper>} />
      <Route path="/TrendReport" element={<LayoutWrapper currentPageName="TrendReport"><TrendReport /></LayoutWrapper>} />
      <Route path="/ThemeLibrary" element={<LayoutWrapper currentPageName="ThemeLibrary"><ThemeLibrary /></LayoutWrapper>} />
      <Route path="/ThemeMatrix" element={<LayoutWrapper currentPageName="ThemeMatrix"><ThemeMatrix /></LayoutWrapper>} />
      <Route path="/SMEReviewQueue" element={<LayoutWrapper currentPageName="SMEReviewQueue"><SMEReviewQueue /></LayoutWrapper>} />
      <Route path="/ValidationTracking" element={<LayoutWrapper currentPageName="ValidationTracking"><ValidationTracking /></LayoutWrapper>} />
      <Route path="/TrendHub/:trendId" element={<LayoutWrapper currentPageName="TrendHub"><TrendHub /></LayoutWrapper>} />
      <Route path="/ReviewQueue" element={<LayoutWrapper currentPageName="ReviewQueue"><ReviewQueue /></LayoutWrapper>} />
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