-- Migration: Szenario, Tester-Name, Call-Dauer und Gesprächsergebnis
alter table sessions add column scenario text;
alter table sessions add column tester_name text;
alter table sessions add column call_duration_seconds int;
alter table sessions add column outcome text;
