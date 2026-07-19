Rental Management System
Problem Statement
1. Introduction
2. Business Challenges
Design and develop an enhanced Rental Management experience
that enables rental businesses to efficiently monitor their operations
from a single interface while automating common rental workflows.
The solution should improve operational efficiency, reduce manual
intervention, and provide better visibility into rental activities
throughout the complete rental lifecycle.
Rental companies commonly face the following challenges:
• No centralized dashboard to monitor ongoing rental operations.
• Difficulty tracking products scheduled for pickup and return.
• Manual calculation of late return charges.
• Lack of visibility into overdue rentals requiring immediate attention.
• Security deposits are often managed outside the rental workflow,
making reconciliation difficult.
• Limited operational insights for rental managers to prioritize daily
activities.
●
●
●
●
●
●
Frontend
Backend
3. Application Workflow
The end user/ portal user can login to the Rental website, browse
the product they want to rent for and select the product and the
rental period, add product to the cart.
Add the shipping details or select to collect the product from the
store.
Add payment related information and make the payment with the
security deposit.
After the payment, the user can download the invoice from the
portal.
For return the user needs to visit the store on the specified time to
return the product.
IF the user returns the product on time he will get the entire security
deposit back.
If the user fails to return the product on time, the penalty will be
calculated and deducted from the security deposit amount.
On portal users can access and manage all their rental order, their
shopping address, profile & profile image and payment related information.
Here the Admin can configure all the organisation specific rental
requirements
• Creating products & Priclist
• Creating rental period
• Quotation Template for faster Quotation Creation
●
●
●
User Role
Admin
When the user comes to rent the product offline/in store, the admin
will create the quotation and if the client wants to rent it on the spot,
the admin will confirm the quotations and create the invoice and
collect the payment with the Security Deposit.
At the time of return, the admin will check the product and timing
and if everything looks good they will return the security deposit
amount to the customer.
If the product is late return, the penalty will be calculated and deducted from the Security Deposit and the remaining amount refunded to the customer.
Admin has responsibility to manage organization-wide Rental Management and Customer information & Rental product records.
Responsibilities
• Create
◦ Product
◦ Pricelist
◦ Rental Period
◦ Manage the User Records
◦ Configuration organization-specific Rental settings.
◦ Maintain pricelist, Late fees, Deposit amount, pickup and return of
the Rental Products.
◦ Create Quotation Template and Header & Footer for Quotation to
send to the client.
●
●
●
●
●
4. Client/ Portal User
5. Authentication
The application starts with a splash screen followed by employee
authentication.
Features
• Portal user Login
• New User Registration
• Profile Creation
After successful authentication, users are redirected to the dashboard.
Screens
• Splash Screen
• Login
• Sign Up
Users can log in to the portal and perform action on the website.
Here users can access & manage all their orders, update their address and also update their photos.
User Can:
• Register and manage their profile
• Browsing the product on rental website
• Select the product and rent it for the specific period
• Add delivery address
• Select to collect the product from store
• Provide payment information
●
●
●
●
●
●
●
●
●
●
●
●
Admin has access to the system backend where they can manage
all the system configuration related work and routine Rental related
tasks.
1. Rental Operations Dashboard
Provide a comprehensive dashboard that offers real-time visibility
into rental activities.
Possible insights include:
• Active Rentals
• Rentals Due Today
• Upcoming Pickups
• Upcoming Returns
• Overdue Rentals
• Revenue from Rentals
• Security Deposits Held
• Late Fee Collection
The dashboard should help rental managers quickly identify priorities and take appropriate actions.
2. Rental Security Deposit Management
Improve how rental deposits are managed throughout the rental
lifecycle.
Possible considerations include:
• Collect security deposits during confirmation.
• Support fixed amount or percentage-based deposits.
• Track deposit payment status.
• Hold deposits until products are successfully returned.
• One the product is successfully delivered on specified time, Security amount is refunded back to the customer without any deduction
• If the product is returned late, the penalty would be calculated
and deducted from Security Deposit
• Maintain complete deposit history.
3. Late Return Fee Management
Automate the handling of overdue rentals.
Possible capabilities:
• Automatically detect overdue returns.
◦ If the product is returned after the specified time period it
would be counted as Late Return and a penalty should be
applied.
◦ This penalty amount would be deducted from the Security
Deposit and rest amount will be refund to client in cash
• Configurable charging rules.
• Hourly, daily, weekly, or monthly late fee calculation.
• Grace period configuration.
●
●
●
●
●
●
●
●
●
●
●
• Maximum late fee limits.
• Automatic invoice generation.
• Clear visibility of outstanding penalties.
4. Pickup & Return Management
Provide a streamlined workflow for product pickup and return.
Possible features:
Pickup
• Daily pickup schedule.
• Route or sequence planning.
• Pickup confirmation.
• Customer notifications.
• Barcode or QR code scanning.
• Pickup checklist.
Return
Daily return schedule.
• Product condition inspection.
• Damage reporting.
• Missing accessories verification.
• Return confirmation.
●
●
●
●
●
●
●
●
●
●
●
●
●
• Automatic stock updates.
• Deposit settlement.
• Late fee calculation.
• Repair workflow initiation when required.
5. Price & Attributes
There would be one default price list which will be applicable to all
the products by default.
Possible features:
• User can create multiple pricelist as required
• Some pricelist are for specific time period
• Create product Variants like Brand, Manufacturer, Color, Size
Expected Outcome
• The proposed solution should:
• Simplify rental operations.
• Reduce manual work.
• Improve operational visibility.
• Automate repetitive rental tasks.
• Enhance customer experience.
• Enable businesses to make faster operational decisions through
real-time insights.
●
●
●
●
●
●
●
●
●
●
●
●
●
●
6. Bonus Ideas
Participants are encouraged to go beyond the core requirements by
introducing innovative capabilities such as:
• Predictive maintenance suggestions
• Smart pickup route optimization
• Automatic customer reminders
• Product availability forecasting
• Mobile-first rental operations
• Barcode/QR scanning
• IoT-enabled asset tracking
• Customizable dashboard widgets
• KPI and business analytics
What Participants Will Learn
• Design and develop a real-world enterprise application.
• Build intuitive UI/UX and end-to-end business workflows.
• Implement secure authentication and role-based access control.
• Develop real-time features, dashboards, and analytical reports.
• Design scalable system architecture and business logic.
• Gain hands-on experience in full-stack application development.
• Strengthen problem-solving, collaboration, and software engineering practices.
●
●
●
●
●
●
●
●
●
Mockup:-
 https://app.excalidraw.com/l/65VNwvy7c4X/5l50ctoqUXw