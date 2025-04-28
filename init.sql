-- Database: hospital_transport

use ride_transport;

CREATE TABLE IF NOT EXISTS `requests` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `patient_name` VARCHAR(255) NOT NULL,
    `patient_phone` VARCHAR(20),
    `pickup_hospital` VARCHAR(255) NOT NULL,
    `dropoff_hospital` VARCHAR(255) NOT NULL,
    `pickup_datetime` DATETIME NOT NULL,
    `dropoff_datetime` DATETIME,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `driver_id` INT, -- Foreign key referencing the drivers table (optional, if you want to track specific drivers)
    `status` ENUM('pending', 'claimed', 'completed', 'cancelled') DEFAULT 'pending',
    `completion_confirmation_token` VARCHAR(255) UNIQUE
);

-- You might have a separate table for drivers if you need to manage them
 CREATE TABLE IF NOT EXISTS `drivers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) UNIQUE,
    `phone` VARCHAR(20) UNIQUE
);


