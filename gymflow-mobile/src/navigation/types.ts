import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

// Root stack: Login → Main (tabs) → GymDetail
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  GymDetail: { gymId: string };
  GymSubscription: { gymId: string };
};

// Bottom tabs
export type TabParamList = {
  Dashboard: undefined;
  Gyms: undefined;
  Support: undefined;
  Logs: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
