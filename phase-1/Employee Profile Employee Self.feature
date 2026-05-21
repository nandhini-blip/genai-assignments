Feature: Employee Profile - Self Service

  As a user, I want to manage my employee profile so that the related functionality works as expected.

  Background:
    Given I am logged in as an employee with username "jdoe"

  Scenario: View own employee profile
    When I navigate to the "My Profile" page
    Then I should see my profile details including name, email, and job title

  Scenario: Update employee profile with valid information
    Given I am on the "My Profile" page
    When I update the email to "john.doe@example.com" and the phone number to "555-1234"
    And I save the changes
    Then the profile is updated with the new email and phone number
    And a success message is displayed

  Scenario: Attempt to update employee profile with invalid email
    Given I am on the "My Profile" page
    When I update the email to "invalid-email" and save the changes
    Then I should see an error message indicating the email format is invalid
    And the profile is not updated

  Scenario: Attempt to view another employee's profile via direct URL
    Given I am logged in as an employee with username "jdoe"
    When I navigate directly to the profile page of employee "asmith"
    Then I should receive an authorization error or be redirected to my own profile

  Scenario: Access profile page without authentication
    Given I am not logged in
    When I navigate to the "My Profile" page
    Then I should be redirected to the login page

  Scenario: Update profile with missing required fields
    Given I am on the "My Profile" page
    When I clear the required field "First Name" and attempt to save
    Then I should see a validation error indicating the field is required
    And the profile is not saved