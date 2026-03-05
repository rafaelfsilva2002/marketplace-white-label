import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStatsScreen } from '@/screens/admin/AdminStatsScreen';
import { AdminModerationScreen } from '@/screens/admin/AdminModerationScreen';

export type AdminStackParamList = {
  AdminStats: undefined;
  AdminModeration: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminStats" component={AdminStatsScreen} />
      <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
    </Stack.Navigator>
  );
}
