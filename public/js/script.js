// Cross-browser form validation script
// This script validates forms on submit, checking required fields
// Compatible with modern browsers including Safari, Chrome, Firefox, Edge
// Features are enabled only when fields are filled incorrectly

document.addEventListener('DOMContentLoaded', function() {
    // Select all forms on the page
    const forms = document.querySelectorAll('form');

    forms.forEach(function(form) {
        // Function to update field colors and messages based on input
        function updateFieldValidation(input) {
            // Remove existing messages
            const existingMsg = input.parentNode.querySelector('.validation-message');
            if (existingMsg) {
                existingMsg.remove();
            }

            if (input.hasAttribute('required')) {
                if (input.value.trim()) {
                    input.style.border = '2px solid green';
                    // Add success message
                    const successMsg = document.createElement('div');
                    successMsg.className = 'validation-message success-message';
                    successMsg.style.color = 'green';
                    successMsg.style.fontSize = '12px';
                    successMsg.textContent = '✓ Valid';
                    input.parentNode.insertBefore(successMsg, input.nextSibling);
                } else {
                    input.style.border = '2px solid red';
                    // Add failure message
                    const failureMsg = document.createElement('div');
                    failureMsg.className = 'validation-message failure-message';
                    failureMsg.style.color = 'red';
                    failureMsg.style.fontSize = '12px';
                    failureMsg.textContent = '✗ This field is required.';
                    input.parentNode.insertBefore(failureMsg, input.nextSibling);
                }
            } else {
                // Non-required fields: green if filled, normal if empty
                if (input.value.trim()) {
                    input.style.border = '2px solid green';
                    const optionalMsg = document.createElement('div');
                    optionalMsg.className = 'validation-message optional-message';
                    optionalMsg.style.color = 'green';
                    optionalMsg.style.fontSize = '12px';
                    optionalMsg.textContent = '✓ Optional field filled';
                    input.parentNode.insertBefore(optionalMsg, input.nextSibling);
                } else {
                    input.style.border = ''; // Normal border
                }
            }
        }

        // Add input event listeners for real-time validation
        const allInputs = form.querySelectorAll('input, textarea, select');
        allInputs.forEach(function(input) {
            input.addEventListener('input', function() {
                updateFieldValidation(input);
            });
            input.addEventListener('change', function() {
                updateFieldValidation(input);
            });
            // Reset to normal on focus if empty
            input.addEventListener('focus', function() {
                if (!input.value.trim()) {
                    input.style.border = '';
                    const existingMsg = input.parentNode.querySelector('.validation-message');
                    if (existingMsg) {
                        existingMsg.remove();
                    }
                }
            });
        });

        form.addEventListener('submit', function(event) {
            let isValid = true;
            const requiredInputs = form.querySelectorAll('input[required], textarea[required], select[required]');
            const emailInputs = form.querySelectorAll('input[type="email"]');

            // Clear previous messages
            const allMessages = form.querySelectorAll('.validation-message');
            allMessages.forEach(function(msg) {
                msg.remove();
            });

            // Validate required inputs
            requiredInputs.forEach(function(input) {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.border = '2px solid red';
                    const failureMsg = document.createElement('div');
                    failureMsg.className = 'validation-message failure-message';
                    failureMsg.style.color = 'red';
                    failureMsg.style.fontSize = '12px';
                    failureMsg.textContent = '✗ This field is required.';
                    input.parentNode.insertBefore(failureMsg, input.nextSibling);
                } else {
                    input.style.border = '2px solid green';
                    const successMsg = document.createElement('div');
                    successMsg.className = 'validation-message success-message';
                    successMsg.style.color = 'green';
                    successMsg.style.fontSize = '12px';
                    successMsg.textContent = '✓ Valid';
                    input.parentNode.insertBefore(successMsg, input.nextSibling);
                }
            });

            // Validate email inputs
            emailInputs.forEach(function(input) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (input.value && !emailRegex.test(input.value)) {
                    isValid = false;
                    input.style.border = '2px solid red';
                    const failureMsg = document.createElement('div');
                    failureMsg.className = 'validation-message failure-message';
                    failureMsg.style.color = 'red';
                    failureMsg.style.fontSize = '12px';
                    failureMsg.textContent = '✗ Please enter a valid email address.';
                    input.parentNode.insertBefore(failureMsg, input.nextSibling);
                } else if (input.value) {
                    input.style.border = '2px solid green';
                    const successMsg = document.createElement('div');
                    successMsg.className = 'validation-message success-message';
                    successMsg.style.color = 'green';
                    successMsg.style.fontSize = '12px';
                    successMsg.textContent = '✓ Valid email';
                    input.parentNode.insertBefore(successMsg, input.nextSibling);
                } else {
                    input.style.border = '';
                }
            });

            // For non-required fields, show green if filled
            const nonRequiredInputs = form.querySelectorAll('input:not([required]), textarea:not([required]), select:not([required])');
            nonRequiredInputs.forEach(function(input) {
                if (input.value.trim()) {
                    input.style.border = '2px solid green';
                    const optionalMsg = document.createElement('div');
                    optionalMsg.className = 'validation-message optional-message';
                    optionalMsg.style.color = 'green';
                    optionalMsg.style.fontSize = '12px';
                    optionalMsg.textContent = '✓ Optional field filled';
                    input.parentNode.insertBefore(optionalMsg, input.nextSibling);
                } else {
                    input.style.border = '';
                }
            });

            // If not valid, prevent form submission
            if (!isValid) {
                event.preventDefault();
                // Scroll to first error if needed
                const firstError = form.querySelector('.failure-message');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
});