import core from "./reminders-core.cjs";
import prisma from "./prisma";
export const formatPatientReminder = core.formatPatientReminder;
export const consoleProvider = core.consoleProvider;
export function dispatchReminders(options = {}) {
  return core.dispatchReminders({ prismaClient: prisma, ...options });
}
