document.addEventListener('DOMContentLoaded', function() {

    /*
        Initialize app w/ Firebase
    */
    try {
        let app = firebase.app();
        let features = ['auth', 'database', 'messaging', 'storage'].filter(feature => typeof app[feature] === 'function');
        document.getElementById('firebase-load').innerHTML = `Firebase SDK loaded with ${features.join(', ')}`;
    } catch (e) {
        console.error(e);
        document.getElementById('firebase-load').innerHTML = 'Error loading the Firebase SDK, check the console.';
    }


    /*
        Main app references and variables
    */
    // firebase references
    var auth = firebase.auth();
    var database = firebase.database();
    var usersRef = database.ref('users');
    var bcRef = database.ref('broadcasting');
    var rqRef = database.ref('requesting');
    // status/location variables
    var curr_status;
    var lat;
    var long;
    var geo_address;


    /*
        Constant DOM elements
    */
    const main_content = document.getElementById('main-content');
    const signin_button = document.getElementById('signin');
    const signout_button = document.getElementById('signout');
    const display_name = document.getElementById('display-name');
    const broadcast_button = document.getElementById('broadcast');
    const request_button = document.getElementById('request');
    const main_info_wrapper = document.getElementById('main-info-wrapper');
    const map = document.getElementById('map');
    const address = document.getElementById('address');
    const status = document.getElementById('status');
    const broadcasting_info = document.getElementById('broadcasting-info');
    const requesting_info = document.getElementById('requesting-info');


    /*
        User signin/signout state change handler
    */
    auth.onAuthStateChanged(function(user) {
        if (user) {
            // display user content if signed in
            main_content.style.display = 'block';
            signin_button.style.display = 'none';
            signout_button.style.display = 'inline-block';
            display_name.innerHTML = user.displayName;
            // write user data to users reference ('users/')
            writeUserData(user.uid, user.displayName, user.email);
        } else {
            // hide user content if signed out
            main_content.style.display = 'none';
            signin_button.style.display = 'inline-block';
            signout_button.style.display = 'none';
            display_name.innerHTML = "";
        }
    });


    /*
        Signin/signout button handlers
    */
    signin_button.onclick = function() {
        // popup login form
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function(error) {
            var errorCode = error.code;
            var errorMessage = error.message;
            var email = error.email;
            var credential = error.credential;
        });
    };
    signout_button.onclick = function() {
        // remove user geolocation from database
        removeUserGeo(auth.currentUser.uid);
        // signout
        auth.signOut();
        // refresh to remove database broadcasting/requesting listeners
        window.location.reload();
    };


    /*
        Sets the user in databse on login
    */
    function writeUserData(userId, name, email) {
        usersRef.child(userId).update({
            username: name,
            email: email
        });
    }
    /*
        Writes user geolocation to database
    */
    function writeUserGeo(userId, lat, long, address) {
        // get a timestamp
        var currentDate = new Date();
        var formattedTime = currentDate.getHours() + ":"
                            + currentDate.getMinutes() + ":"
                            + currentDate.getSeconds();

        if (curr_status === 'bc') { // if user is broadcasting...
            // add query to broadcasting reference
            bcRef.child(userId).update({
                location: {
                    lat: lat,
                    long: long,
                    address: address
                },
                timestamp: formattedTime
            });
        } else if (curr_status === 'rq') { // if user is requesting...
            // add query to requesting reference
            rqRef.child(userId).update({
                location: {
                    lat: lat,
                    long: long,
                    address: address
                },
                timestamp: formattedTime
            });
        }
    }
    /*
        Removes user from broadcasting/requesting nodes. Used on signout and browser close/unload
    */
    function removeUserGeo(userId) {
        bcRef.child(userId).remove();
        rqRef.child(userId).remove();
    }


    /*
        Broadcast button handler
    */
    broadcast_button.onclick = function() {
        if (curr_status !== 'bc') { // if not currently broadcasting...
            // update database with geolocation
            updateStatus('bc');
            getGeolocation(curr_status);
            rqRef.child(auth.currentUser.uid).remove();
        }
        // change page styles
        this.style.display = "none";
        request_button.style.display = "inline-block";
        updateDisplays(); // add listeners for query changes
        main_info_wrapper.style.display = 'block';
    };
    /*
        Request button handler
    */
    request_button.onclick = function() {
        if (curr_status !== 'rq') { // if not currently requesting...
            // update database with geolocation
            updateStatus('rq');
            getGeolocation();
            bcRef.child(auth.currentUser.uid).remove();
        }
        // change page styles
        this.style.display = "none";
        broadcast_button.style.display = "inline-block";
        updateDisplays(); // add listeners for query changes
        main_info_wrapper.style.display = 'block';
    };


    /*
        Add initial handlers to watch database for broadcasting/requesting updates
    */
    function updateDisplays() {
        // add broadcasting query listener
        bcRef.on('child_added', function (snap) {
            if (document.getElementById(snap.key)) { // prevent duplicates
                document.getElementById(snap.key).remove();
            }
            if (auth.currentUser.uid !== snap.key) { // prevent creating self as user in DOM
                createUserContainer(snap, broadcasting_info);
            }
        });
        // remove element from DOM on broadcasting query change
        bcRef.on('child_removed', function (snap) {
            if (document.getElementById(snap.key)) {
                document.getElementById(snap.key).remove();
            }
        });
        // add requesting query listener
        rqRef.on('child_added', function (snap) {
            if (document.getElementById(snap.key)) { // prevent duplicates
                document.getElementById(snap.key).remove();
            }
            if (auth.currentUser.uid !== snap.key) { // prevent creating self as user in DOM
                createUserContainer(snap, requesting_info);
            }
        });
        // remove element from DOM on requesting query change
        rqRef.on('child_removed', function (snap) {
            if (document.getElementById(snap.key)) {
                document.getElementById(snap.key).remove();
            }
        });
    }


    /*
        Update current user status to broadcasting/requesting
    */
    function updateStatus(new_status) {
        curr_status = new_status;
        status.innerHTML = (new_status === 'bc' ? 'BROADCASTING' : 'REQUESTING');
    }


    /*
        Create user card under broadcasting/requesting containers
    */
    function createUserContainer(user_snap, wrapper) {
        // user's id
        var uid = user_snap.key;
        // create outer container
        var container = document.createElement('div');
        container.className = "user-container";
        container.id = uid;
        // create user info, add to container
        usersRef.child(uid).once('value').then(function(snap) {
            var usernameTag = document.createElement('p');
            var emailTag = document.createElement('p');
            usernameTag.innerHTML = snap.val().username;
            emailTag.innerHTML = snap.val().email;
            container.appendChild(usernameTag);
            container.appendChild(emailTag);
        });
        // add route button w/ event listener
        var routeBtn = document.createElement('i');
        routeBtn.innerHTML = 'directions';
        routeBtn.className = 'material-icons';
        routeBtn.onclick = function() {
            // create onclick handler for directions to this user
            getRoute(uid, user_snap.ref.parent.key);
        }
        container.appendChild(routeBtn);
        // add container to wrapper div
        wrapper.appendChild(container);
    }


    /*
        Gets the route from current user's location (lat/long) to target user's location (lat/long). See: https://msdn.microsoft.com/en-us/library/dn217138.aspx?f=255&MSPPError=-2147217396
        for parameter information
    */
    function getRoute(userId, status) {
        // get target child reference
        var ref = (status === 'broadcasting') ? bcRef : rqRef;
        // query child
        ref.child(userId).once('value').then(function(snap) {
            let target_lat = snap.val().location.lat;
            let target_long = snap.val().location.long;
            // open map in new window
            window.open("http://bing.com/maps/default.aspx?rtp=~pos." + lat + "_" + long + "~pos." + target_lat + "_" + target_long + "_Destination&rtop=0~1~0");
        });
    }


    /*
        Gets the geolocation of the user through browser location and Bing Maps. Displays map of current location.
    */
    function getGeolocation() {
        if (navigator.geolocation) {
            if (auth.currentUser) {
                // Call getCurrentPosition with success and failure callbacks
                navigator.geolocation.getCurrentPosition(success, fail);
            } else {
                alert("Please sign in before performing this action.");
            }
        } else {
            alert("Sorry, your browser does not support geolocation services.");
        }

        function success(position) {
            // get latitude, longitude
            lat = position.coords.latitude;
            long = position.coords.longitude;
            // Bing Maps API key
            let mapKey = "Apc_fU6IcswHunjJCEvmfDoR6Fn8K5kMr7vfZjw7jpmPtlveXWXZv0ZHssHB2oAN";
            // Convert lat/long to an address using Bing Maps Location API and JSON parse
            let jsonLink = "http://dev.virtualearth.net/REST/v1/Locations/" + lat + "," + long + "/?includeNeighborhood=1&key=" + mapKey;
            let jsonLinkObject = JSON.parse(getJSON(jsonLink));
            geo_address = jsonLinkObject.resourceSets[0].resources[0].name;
            // Get embedded map src link
            let mapLink = "https://www.bing.com/maps/embed?cp=" + lat + "~" + long + "&lvl=15&typ=d&sty=r&src=SHELL&FORM=MBEDV8";
            // Update map
            map.src = mapLink;
            // Create JSON link element
            address.innerHTML = geo_address;
            // update user location
            writeUserGeo(auth.currentUser.uid, lat, long, geo_address);
        }

        function fail() {
            alert('Something went wrong, please check your connection and try again.');
        }
    }
    // Get json from link
    function getJSON(url) {
        var resp;
        var xmlHttp;
        resp = '';
        xmlHttp = new XMLHttpRequest();
        if (xmlHttp != null) {
            xmlHttp.open("GET", url, false);
            xmlHttp.send(null);
            resp = xmlHttp.responseText;
        }
        return resp;
    }

    // reset geolocation on exit
    window.addEventListener("beforeunload", function (e) {
      (e || window.event).returnValue = removeUserGeo(auth.currentUser.uid); //Gecko + IE
      return removeUserGeo(auth.currentUser.uid);                            //Webkit, Safari, Chrome
    });

});
