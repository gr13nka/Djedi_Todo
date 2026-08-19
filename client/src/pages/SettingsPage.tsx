import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeToggle } from '../components/settings/ThemeToggle';
import { BarStylePicker } from '../components/settings/BarStylePicker';
import { DayBoundarySettings } from '../components/settings/DayBoundarySettings';
import { TimezoneSettings } from '../components/settings/TimezoneSettings';
import { TaskSettings } from '../components/settings/TaskSettings';
import { LanguagePicker } from '../components/settings/LanguagePicker';
import { NavPositionPicker } from '../components/settings/NavPositionPicker';
import { BottomNavSettings } from '../components/settings/BottomNavSettings';
import { AccentColorPicker } from '../components/settings/AccentColorPicker';
import { ZoomSettings } from '../components/settings/ZoomSettings';
import { FontPicker } from '../components/settings/FontPicker';
import { ProjectTypographySettings } from '../components/settings/ProjectTypographySettings';
import { TimeTrackingSettings } from '../components/settings/TimeTrackingSettings';
import { VaultSettings } from '../components/settings/VaultSettings';
import { Card } from '../components/ui/Card';
import { NEU } from '../utils/shadows';
import { useTranslation } from '../i18n/useTranslation';
import { DailyView } from '../components/analytics/DailyView';
import { WeeklyView } from '../components/analytics/WeeklyView';
import { MonthlyView } from '../components/analytics/MonthlyView';
import { StreaksView } from '../components/analytics/StreaksView';
import { useSettingsStore } from '../stores/settingsStore';

type TopTab = 'settings' | 'analytics';
type AnalyticsTab = 'daily' | 'weekly' | 'monthly' | 'streaks';

const Divider = () => <div className="border-t border-border my-3" />;

function ThemeSection() {
  return (
    <>
      <ThemeToggle />
      <Divider />
      <AccentColorPicker />
    </>
  );
}

function AppearanceSection() {
  return (
    <>
      <BarStylePicker />
      <Divider />
      <FontPicker />
      <Divider />
      <ZoomSettings />
      <Divider />
      <ProjectTypographySettings />
    </>
  );
}

function NavigationSection() {
  return (
    <>
      <NavPositionPicker />
      <Divider />
      <BottomNavSettings />
      <Divider />
    </>
  );
}

function TimeSection() {
  return (
    <>
      <DayBoundarySettings />
      <Divider />
      <TimezoneSettings />
      <Divider />
      <TimeTrackingSettings />
    </>
  );
}

const sectionComponents = [
  { key: 'settings.language', component: LanguagePicker },
  { key: 'settings.theme', component: ThemeSection },
  { key: 'settings.appearance', component: AppearanceSection },
  { key: 'settings.navPosition', component: NavigationSection },
  { key: 'settings.time', component: TimeSection },
  { key: 'settings.tasks', component: TaskSettings },
  { key: 'settings.vault', component: VaultSettings },
] as const;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function SettingsPage() {
  const { t } = useTranslation();
  const timeTrackingVisible = useSettingsStore((s) => s.timeTrackingVisible);
  const [topTab, setTopTab] = useState<TopTab>('settings');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('daily');

  const topTabs: { value: TopTab; label: string }[] = [
    { value: 'settings', label: t('settings.tabSettings') },
    ...(timeTrackingVisible ? [{ value: 'analytics' as const, label: t('settings.tabAnalytics') }] : []),
  ];

  useEffect(() => {
    if (!timeTrackingVisible && topTab === 'analytics') setTopTab('settings');
  }, [timeTrackingVisible, topTab]);

  const analyticsTabs: { value: AnalyticsTab; label: string }[] = [
    { value: 'daily', label: t('analytics.daily') },
    { value: 'weekly', label: t('analytics.weekly') },
    { value: 'monthly', label: t('analytics.monthly') },
    { value: 'streaks', label: t('analytics.streaks') },
  ];

  return (
    <div>
      <h1 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">{t('settings.title')}</h1>

      {/* Top-level tab bar */}
      <div
        className="flex gap-1 mb-6 bg-bg-card rounded-lg p-1"
        style={{ boxShadow: NEU.pressed }}
      >
        {topTabs.map((tb) => (
          <button
            key={tb.value}
            onClick={() => setTopTab(tb.value)}
            className={`relative flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              topTab === tb.value
                ? 'text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {topTab === tb.value && (
              <motion.div
                layoutId="settings-tab"
                className="absolute inset-0 rounded-md bg-bg-primary"
                style={{ boxShadow: NEU.raisedSm }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tb.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {topTab === 'settings' ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="flex flex-col gap-8"
              variants={container}
              initial="hidden"
              animate="show"
            >
              {sectionComponents.map((section) => (
                <motion.div key={section.key} variants={item}>
                  <span className="block text-[10px] font-semibold uppercase tracking-widest text-text-muted/70 mb-2 pl-1">
                    {t(section.key)}
                  </span>
                  <Card>
                    <section.component />
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : timeTrackingVisible && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
          >
            {/* Analytics sub-tabs */}
            <div
              className="flex gap-1 mb-6 bg-bg-card rounded-lg p-1"
              style={{ boxShadow: NEU.pressed }}
            >
              {analyticsTabs.map((tb) => (
                <button
                  key={tb.value}
                  onClick={() => setAnalyticsTab(tb.value)}
                  className={`relative flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    analyticsTab === tb.value
                      ? 'text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {analyticsTab === tb.value && (
                    <motion.div
                      layoutId="analytics-subtab"
                      className="absolute inset-0 rounded-md bg-bg-primary"
                      style={{ boxShadow: NEU.raisedSm }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{tb.label}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={analyticsTab}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                {analyticsTab === 'daily' && <DailyView />}
                {analyticsTab === 'weekly' && <WeeklyView />}
                {analyticsTab === 'monthly' && <MonthlyView />}
                {analyticsTab === 'streaks' && <StreaksView />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
