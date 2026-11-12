-- Rename the restaurant section from "Dinner" to "Dining" to match the guide's tab bar.
-- Safe to run more than once; leaves custom titles alone.
UPDATE sections SET title = 'Dining' WHERE type = 'food' AND title = 'Dinner';
