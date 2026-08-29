// Calendar UI now lives in a shared component so both /admin/calendar and
// /master/calendar can reuse it (they differ only in delete permissions,
// enforced server-side and reflected here via the `role` returned by the API).
export { default } from "@/components/CalendarView";
