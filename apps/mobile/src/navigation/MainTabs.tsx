import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@marketplace/shared';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { SearchResultsScreen } from '@/screens/home/SearchResultsScreen';
import { ProfileDetailScreen } from '@/screens/home/ProfileDetailScreen';
import { SemanticSearchScreen } from '@/screens/search/SemanticSearchScreen';
import { DashboardScreen } from '@/screens/dashboard/DashboardScreen';
import { EditProfileScreen } from '@/screens/dashboard/EditProfileScreen';
import { MyReviewsScreen } from '@/screens/dashboard/MyReviewsScreen';
import { SubscriptionScreen } from '@/screens/dashboard/SubscriptionScreen';
import { SettingsScreen } from '@/screens/dashboard/SettingsScreen';

export type HomeStackParamList = {
  Home: undefined;
  SearchResults: { q?: string; city?: string; service?: string };
  ProfileDetail: { id: string };
};

export type SearchStackParamList = {
  SemanticSearch: undefined;
  SearchResults: { q?: string };
  ProfileDetail: { id: string };
};

export type DashboardStackParamList = {
  Dashboard: undefined;
  EditProfile: { id: string };
  MyReviews: { profileId: string };
  Subscription: undefined;
  Settings: undefined;
};

export type ProfileStackParamList = {
  Settings: undefined;
};

const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
function HomeStackScreen() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="Home" component={HomeScreen} />
      <HomeStackNav.Screen name="SearchResults" component={SearchResultsScreen} />
      <HomeStackNav.Screen name="ProfileDetail" component={ProfileDetailScreen} />
    </HomeStackNav.Navigator>
  );
}

const SearchStackNav = createNativeStackNavigator<SearchStackParamList>();
function SearchStackScreen() {
  return (
    <SearchStackNav.Navigator screenOptions={{ headerShown: false }}>
      <SearchStackNav.Screen name="SemanticSearch" component={SemanticSearchScreen} />
      <SearchStackNav.Screen name="SearchResults" component={SearchResultsScreen} />
      <SearchStackNav.Screen name="ProfileDetail" component={ProfileDetailScreen} />
    </SearchStackNav.Navigator>
  );
}

const DashboardStackNav = createNativeStackNavigator<DashboardStackParamList>();
function DashboardStackScreen() {
  return (
    <DashboardStackNav.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStackNav.Screen name="Dashboard" component={DashboardScreen} />
      <DashboardStackNav.Screen name="EditProfile" component={EditProfileScreen} />
      <DashboardStackNav.Screen name="MyReviews" component={MyReviewsScreen} />
      <DashboardStackNav.Screen name="Subscription" component={SubscriptionScreen} />
      <DashboardStackNav.Screen name="Settings" component={SettingsScreen} />
    </DashboardStackNav.Navigator>
  );
}

const ProfileTabStackNav = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStackScreen() {
  return (
    <ProfileTabStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileTabStackNav.Screen name="Settings" component={SettingsScreen} />
    </ProfileTabStackNav.Navigator>
  );
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 10, color: focused ? '#dc2626' : '#737373' }}>{label}</Text>;
}

const Tab = createBottomTabNavigator();

export function MainTabs() {
  const { user } = useAuth();
  const isProfessional = user?.role === UserRole.Professional;

  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#dc2626', tabBarInactiveTintColor: '#737373' }}>
      <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ tabBarLabel: 'Inicio', tabBarIcon: ({ focused }) => <TabIcon label="🏠" focused={focused} /> }} />
      <Tab.Screen name="SearchTab" component={SearchStackScreen} options={{ tabBarLabel: 'Busca', tabBarIcon: ({ focused }) => <TabIcon label="🔍" focused={focused} /> }} />
      {isProfessional && (
        <Tab.Screen name="DashboardTab" component={DashboardStackScreen} options={{ tabBarLabel: 'Painel', tabBarIcon: ({ focused }) => <TabIcon label="📊" focused={focused} /> }} />
      )}
      <Tab.Screen name="ProfileTab" component={ProfileStackScreen} options={{ tabBarLabel: 'Perfil', tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} /> }} />
    </Tab.Navigator>
  );
}
