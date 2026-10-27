import { BookOpen, CalendarCheck, ChartColumn, Dumbbell, IndianRupee, MessageCircle, Smartphone, Tag, Upload, Users, type LucideIcon } from 'lucide-react';
import type { FeatureIcon } from '../data/featurePages';

export const ICONS: Record<FeatureIcon, LucideIcon> = {
  users: Users,
  rupee: IndianRupee,
  'calendar-check': CalendarCheck,
  smartphone: Smartphone,
  message: MessageCircle,
  chart: ChartColumn,
  upload: Upload,
  dumbbell: Dumbbell,
  tag: Tag,
  book: BookOpen,
};
