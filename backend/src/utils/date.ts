// All analytics days are UTC "YYYY-MM-DD" strings, which sort and compare as dates.
export const isoDay = (d = new Date()): string => d.toISOString().slice(0, 10);

export const addDays = (day: string, n: number): string => isoDay(new Date(Date.parse(day) + n * 86_400_000));
