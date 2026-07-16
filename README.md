# A Payment System for Friend Groups
This backend acts as a centralised ledger among friend groups, keeping tracl of debts owed and money needed to be repaid. This system is currently deployed to an EC2 instance, and the backend code is modified slightly. Nevertheless, all important features are preserved in this version well. This app has a feature that is not present in any other payment app as far as I know, that being actually tracking individual debts and having means to resolve them easily. 
Currently, the app has 29 users across 5 friend groups.
Note: since we don't runt this for profit, we do not have the funds necessary to keep this running as a full blown operation. As such, usage of this app is invite-only as of now.

# Features
+ Has a centralised ledger system on a MySQL database, that tracks all debts across a friendgroup.
+ Has features like account creation, deletion, and management. Also has friendgroup creation, managementm and administration features.
+ Server acts as a source of truth for all people, avoiding conflicts before they happen.
+ Multiple debts can be resolved in a single transaction, removing the necessity of people needing to keep track of individual debts by themselves.
+ Robust database designs ensures data is durable, secure, and safe at all times.
+ Can implement horizontal scaling measures to scale the app to multiple locations, using geosharding and multiple availability zones to expland this concept further if needed.

# How to Run
+ Get the .apk from the frontend repository (silversocks/payn-frontend), or run the app as a web app in a browser of choice.
+ Run the app, create a username and password, login, and join/create a friendgroup.
+ Get others to join the group as well, and log all your payments and debts to each other.

# What We Learned
+ A lot of database management
+ A lot about backend engineering and system design
+ A lot about AWS and deployment to the cloud
+ A lot about state management across multiple devices, keeping data durable and accessible, and principles for creating backups
+ And a lot about how to create something that solves a real life problem, that no one else has ever created before
