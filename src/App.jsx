import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Briefs from './pages/Briefs';
import SubmitBrief from './pages/SubmitBrief';
import SubmitBriefBeta from './pages/SubmitBriefBeta';
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
import { Navigate } from 'react-router-dom';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// Routes available once the visitor is authenticated. Role decides which set:
// reviewers get the SME portal only, non-admins get the submitter surface,
// admins get the full workspace.
const gatedRoutesForRole = (role) => {
  if (role === 'reviewer') {
    return (
      <>
        <Route path="/review" element={<ReviewerLayout><SMEReviewPortal /></ReviewerLayout>} />
        <Route path="*" element={<Navigate to="/review" replace />} />
      </>
    );
  }

  if (role !== 'admin') {
    return (
      <>
        <Route path="/Profile" element={<SubmitterLayout><Profile /></SubmitterLayout>} />
        <Route path="*" element={<Navigate to="/SubmitBrief" replace />} />
      </>
    );
  }

  return (
    <>
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
      <Route path="/SubmitBriefBeta" element={<LayoutWrapper currentPageName="SubmitBriefBeta"><SubmitBriefBeta /></LayoutWrapper>} />
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
    </>
  );
};

const AuthenticatedApp = () => {
  const { user, isLoadingPublicSettings } = useAuth();

  // Wait for app settings; ProtectedRoute handles the auth loading state itself.
  if (isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Auth pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public pages — reachable without a login */}
      <Route path="/access" element={<AccessGuide />} />
      <Route path="/access-review" element={<AccessGuideReview />} />
      <Route path="/SubmitBrief" element={<SubmitBrief />} />

      {/* Everything else requires authentication */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {gatedRoutesForRole(user?.role)}
      </Route>
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