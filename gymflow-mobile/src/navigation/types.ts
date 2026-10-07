import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root stack: Login → Main (tabs) → GymDetail
export type RootStackParamList = {
  Login: undefined;
  // NavigatorScreenParams lets a push deep-link target a specific tab, e.g.
  // navigate('Main', { screen: 'Support' }) for a ticket/feedback notification.
  Main: NavigatorScreenParams<TabParamList> | undefined;
  GymDetail: { gymId: string };
  GymSubscription: { gymId: string };
  Notifications: undefined;
  // An email conversation in the support inbox. Push taps and the inbox list open it.
  EmailThread: { threadId: string };
  // Writing a reply: Gmail-style composer with formatting and attachments. `initialText`
  // carries an AI draft or the text of a failed reply; `retryMessageId` reuses the failed row.
  // With no threadId it is a NEW message: the recipient is picked from people who have
  // written to support, and the subject is typed.
  EmailCompose: {
    threadId?: string;
    subject?: string;
    toName?: string | null;
    toEmail?: string;
    initialText?: string;
    retryMessageId?: string;
  } | undefined;
};

// Bottom tabs
export type TabParamList = {
  Dashboard: undefined;
  Gyms: undefined;
  Support: undefined;
  Inbox: undefined;
  Logs: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
