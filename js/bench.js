// Display message if browser doesnt support webGL
if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

// declare global variables
var container; // object holding the div area for web gl rendering
var stats; // gui and stats objects for debugging
var clock;
var camera,progress; // three core specific objects
var scene = new THREE.Scene();
var cameraNum = 1;
var dae; // scene object instantiated from collada loaded model
var windowSize = {x:null, y:null};
var vpDiv;

var mouseDrag = false;
var startMousePos = null;

var lightmultimeter = THREE.ImageUtils.loadTexture('imgs/multimeter_lightmap.jpg');
var lightShowroom = THREE.ImageUtils.loadTexture('imgs/showroom_lightmap-gi.jpg');
var otherProductsAO = THREE.ImageUtils.loadTexture('imgs/ao-other-products.jpg');

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
mouse.y = null;
mouse.x = null;

var myScene;
myScene = {
    noOfProducts: 0,
    targetLocal: new THREE.Vector3(0, 0, 0),
    productToLoad: ['workbench3'], // this is the list of files that get read in from storage, eg: 'workbench.dae'
    productList: ['camStart','multimeter2','earthplug','esdwriststrap','solderingstation','functiongenerator','bitsdraw','multimeter'], // this is the list of 3d elements that get converted in to clickable elements in the scene, eg: object3d scene.getObjectByName('multimeter')
    products: [], // empty array waiting to be filled with scene objects

    loadMysceneData: function () {
        var index;
        var product = null;
        noOfProducts = this.productList.length;

        for (index = 0; index < noOfProducts; index++) {
            myScene.loadProductIn(index); //  creates a profuct object into the myscene array
            if (index == (noOfProducts - 1)) {
                init(); // call the initialisation function to setup the rest of the scene
                animate(); // render scene to screen and call the animation loop
            }
        }
    },
    loadProductIn: function (i) {
        var productObj = new Object(); // create empty product object ready to read data into and push to array
        // initialise product object data
        productObj.name = 'empty';
        productObj.object3d = null;
        productObj.hasPois = false;
        productObj.worldObjPos = new THREE.Vector3(0,0, 0); // the local vector coordinate of the product (product centre)
        productObj.worldCamPos = new THREE.Vector3(0, 0.2, 0.5); // the local camera position facing the product
        productObj.poiList = [];

        var objectToload = this.productList[i]; // gets the string (name)of the object to load from the array
        var obj = scene.getObjectByName(objectToload); // read the object in to variable to do stuff

        this.calculateBoundingBox(obj, objectToload); // calculate bounding area of the box
        productObj.name = objectToload; // set name of product object3d name
        productObj.object3d = obj;
        obj.localToWorld(productObj.worldObjPos); // calculates the world space of the object relative to the vector position
        obj.localToWorld(productObj.worldCamPos); // calculates the world space of the required camera position relative to the vector position

        /* load the pois list from the product  */
        this.loadPois (obj,productObj);

        myScene.products.push(productObj); // adds the product to the end of the product array

    },
    calculateBoundingBox: function (obj, name) {
        var box = new THREE.BoundingBoxHelper(obj);

        box.update();
        box.updateMatrixWorld(true);

        box.material.transparent = true;
        box.material.opacity = 0;
        box.name = 'bbox_' + name; // create bbox name for object3d

        scene.add(box);

        THREE.SceneUtils.attach(obj, scene, box);
        box.geometry.applyMatrix(box.matrix.makeScale(1.01, 1.01, 1.01));// (box.scale.x +0.01,box.scale.y +0.01,box.scale.z +0.01);
    },
    loadPois: function (obj3d,productObj) {
        obj3d.traverse(function(child) {
            if (child.name == 'poi_group') {
                productObj.hasPois = true;
                for (var i = 0; i < child.children.length; i++ ){
                    var poi = child.children[i];
                    var poiListObj = new Object(); // create empty poilist object ready to read data into and push to array
                    // initialise poi object data
                    poiListObj.object3d = poi;
                    poiListObj.name = poi.name;

                    // set visibility of POI to flase
                    poiListObj.object3d.children[0].material.transparent = true;
                    poiListObj.object3d.children[0].material.opacity = 0;

                    poiListObj.worldObjPos = new THREE.Vector3(0, 0, 0); // the local vector coordinate of the poi (poi centre)
                    poiListObj.worldCamPos = new THREE.Vector3(0,0.05,0.15);// the local camera position facing the poi
                    // calculate the world positions of the poi object and the camera
                    poi.localToWorld(poiListObj.worldObjPos);
                    poi.localToWorld(poiListObj.worldCamPos);

                    productObj.poiList.push (poiListObj);
                }
            }
        });

    }
};

var myView =
{
    mouseInViewPort: true,
    level0StartPos: new THREE.Vector3(0, 0, 0),
    startPosition: null,

    currentProduct: {name:null,num:null},
    previousProduct: {name:null,num:null},
    rollOverProduct: {name:null,num:null},
    level: 0,

    isInPoi: false,



    normal: new THREE.Color().setRGB( 0.0, 0.0, 0.0 ),
    hover: new THREE.Color().setRGB( 0.2, 0.2, 0.2 ),
    click: new THREE.Color().setRGB( 0.15, 0.15, 0.2 ),

    dimensions: new THREE.Vector2( 0, 0 ),
    background: new THREE.Color().setRGB( 1.0, 1.0, 1.0 ),
    up: [ 0, 1, 0 ],
    fov: 55,
    defaultFov:65,
    controls: null,
    camera: null,
    renderer: null,
    yaw: 0, // look left and right
    pitch: 0, // look up down angle
    currentDrag: new THREE.Vector2( 0, 0 ),
    previousdrag: new THREE.Vector2( 0, 0 ),
    deltaDrag: new THREE.Vector2( 0, 0 ),
    totalDrag: new THREE.Vector2( 0, 0 ),
    camIsTweening: false,

    animateCam: function (myProduct) {
        this.camIsTweening = true;

        myView.camTween(myProduct.worldObjPos, myProduct.worldCamPos, 1000 ,myProduct.name);
    },
    camTween: function (targDestination,camDestination, time, name) {
        var camStart = myView.camera.position;
        var targStart = myView.controls.target;

        var tweenArray = {X:camStart.x,Y:camStart.y,Z:camStart.z,XtargStart:targStart.x,YtargStart:targStart.y,ZtargStart:targStart.z,fovStart:myView.camera.fov};

        var tween = new TWEEN.Tween(tweenArray).to({X:camDestination.x,Y:camDestination.y,Z:camDestination.z,XtargStart:targDestination.x,YtargStart:targDestination.y,ZtargStart:targDestination.z,fovStart:myView.defaultFov}, time);
        tween.easing(TWEEN.Easing.Sinusoidal.InOut);

        var onUpdate = function () {
            myView.camera.position.x = tweenArray.X;
            myView.camera.position.y = tweenArray.Y;
            myView.camera.position.z = tweenArray.Z;
            myView.camera.fov = tweenArray.fovStart;
            myView.controls.target.set (tweenArray.XtargStart,tweenArray.YtargStart,tweenArray.ZtargStart);

        };
        tween.onUpdate(onUpdate);
        tween.start();
        tween.onComplete(function() {
            if (name == 'camStart' ){
                myView.controls.enabled = false;
                myView.controls = null;
                myView.level = 0;
                $('#navigate').stop().animate ({opacity: 0},50);
            }

        });
    },
    moveCamera: function ( drag ) {
        this.currentDrag = drag;
        this.deltaDrag.x = this.currentDrag.x - this.previousdrag.x;
        this.deltaDrag.y = this.currentDrag.y - this.previousdrag.y;

        this.totalDrag.x += Math.abs(this.deltaDrag.x);
        this.totalDrag.y = Math.abs(this.deltaDrag.y);

        this.previousdrag.x = drag.x;
        this.previousdrag.y = drag.y;

        if (myView.level == 0){
            this.camera.rotation.y += this.deltaDrag.x / (21000 / this.camera.fov);
            this.camera.rotation.x += this.deltaDrag.y / (17000 / this.camera.fov);
            this.camera.rotation.z = 0;
        }
    },
    zoomCamera: function (fovDelta ) {
        this.camera.fov += fovDelta;
        this.camera.fov = Math.min(Math.max(parseInt(this.camera.fov), 20), 65);

    },
    setCamToOrbitControls: function (){ var camTarget = new THREE.Vector3 (0,0,-1); // set a camera vector looking down z (toward scene)
        this.camera.localToWorld(camTarget); //set the vector coordinates to local vector space from camera.
        this.controls = new THREE.OrbitControls(myView.camera,myView.renderer.domElement); // set the orbit controls

        this.controls.target.set(camTarget.x,camTarget.y,camTarget.z);
        //this.camera.position.set(myView.level0StartPos.x,myView.level0StartPos.y,myView.level0StartPos.z);
        myView.controls.enabled = true;

        this.controls.update();
    }

};
/* ****************  LOADER **************** */

var manager = new THREE.LoadingManager();
var loader = new THREE.ColladaLoader( manager );
manager.onProgress = function ( item, loaded, total ) {

    console.log (loaded);
    if (loaded == total)
        manager.onLoad();
};
manager.onLoad = function ( item, loaded, total ) {
    myScene.loadMysceneData ();
    console.log (loaded);
    $('.load-bar').css({'width':'100%'});
    $('#enter').stop().fadeToggle(200, "linear" );
    $('#enter').click(function() {
        $('.title-screen').stop().fadeToggle(500, "linear" );
    });
};

$.each( myScene.productToLoad, function( key, value ) {

    loader.load( 'maya/exports/'+ value +'.dae', function ( object ) {

            dae = object.scene;
            scene.add( dae );
            manager.onProgress('maya/exports/'+ value +'.dae',key + 1,myScene.productToLoad.length );

        },
        function ( xhr ) { // Function called when download progresses

            var width = xhr.loaded / xhr.total * 100;
            console.log( width + '% loaded' );
            $('.load-bar').css({'width':width+'%'});
        }
    );

});

// once everything is loaded, we run our Three.js stuff.
function init() {

    stats = initStats(); // function call to setup stats
    clock = new THREE.Clock(); // instantiates a clock to use for getting the time delta between frames to calculate animations

    scene.updateMatrixWorld(); // needs to be called to correctly compute world coords from local

    scene.getObjectByName('camStart').parent.visible = false; // hide the cam start, its not needed in the scene

    var poi = scene.getObjectByName('poi_0');


    poi.children[0].material.transparent = true;
    poi.children[0].material.opacity = 0;
    console.log (scene);

    var unitbbox = scene.getObjectByName('unitbbox'); // hide the cam start, its not needed in the scene


    var lightmultimeter = THREE.ImageUtils.loadTexture('imgs/multimeter_lightmap.jpg');

    var multimeter = scene.getObjectByName('multimeter');
    multimeter.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            child.material.lightMap = lightmultimeter;
        }
    });
    var multimeter2 = scene.getObjectByName('multimeter2');
    multimeter2.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            child.material.lightMap = lightmultimeter;
        }
    });


    var lightShowroom = THREE.ImageUtils.loadTexture('imgs/showroom_lightmap-gi.jpg');
    var otherProductsAO = THREE.ImageUtils.loadTexture('imgs/ao-other-products.jpg');


    var earthplug = scene.getObjectByName('earthplug');
    earthplug.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[0].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });
    var esdwriststrap = scene.getObjectByName('esdwriststrap');
    esdwriststrap.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });
    var solderingstation = scene.getObjectByName('solderingstation');
    solderingstation.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });
    var functiongenerator = scene.getObjectByName('functiongenerator');
    functiongenerator.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });
    var functiongenerator = scene.getObjectByName('functiongenerator');
    functiongenerator.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });
    var bitsdraw = scene.getObjectByName('bitsdraw');
    bitsdraw.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = otherProductsAO;
                }
            }
            else {
                child.material.lightMap = otherProductsAO;
            }
        }
    });

    var showroom = scene.getObjectByName('showroom');

    showroom.traverse(function(child) {
        if (child instanceof THREE.Mesh) {
            if (child.material instanceof THREE.MultiMaterial) {

                for (i = 0; i < child.material.materials.length; i++) {
                    child.material.materials[i].lightMap = lightShowroom;
                }
            }
            else {
                child.material.lightMap = lightShowroom;
            }
        }

    });


    vpDiv = document.getElementById("vp0"); // assign a div to an object in the myViews array

    setmyViewDimensions (myView);
    myView.renderer = new THREE.WebGLRenderer();
    myView.renderer.setClearColor(new THREE.Color(0xEEEEEE));
    myView.renderer.setSize(myView.dimensions.x, myView.dimensions.y);
    vpDiv.appendChild(myView.renderer.domElement);
    vpDiv.appendChild(stats.dom);

    // ################ add lights
    //var light = new THREE.AmbientLight( 0x3e3e38 ); // soft white light
    //scene.add( light );

    // position and point the camera to the center of the scene

    myView.camera = scene.getObjectByName('cam0').children[0];

    myView.camera.eulerOrder = "YXZ";
    myView.camera.applyMatrix (scene.getObjectByName('cam0').matrix);
    myView.camera.updateMatrix();

    myView.camera.aspect = (myView.dimensions.x / myView.dimensions.y);
    myView.camera.fov = myView.fov;
    myView.level0StartPos.x = myView.camera.position.x;
    myView.level0StartPos.y = myView.camera.position.y;
    myView.level0StartPos.z = myView.camera.position.z;

    scene.add (myView.camera);

}
function animate() {
    if (myView.camIsTweening == true){
        TWEEN.update();
    }
    renderScene();
    stats.update();
    requestAnimationFrame(animate); // render using requestAnimationFrame


    var camera = myView.camera;

    if (myView.currentProduct.num != null)
    {

        var currentProduct = myScene.products[myView.currentProduct.num];
        var currentProductName = currentProduct.name;

        var i;
        for (i = 0; i < currentProduct.poiList.length; i++) {

            var divObj = $('#'+currentProductName+'_pois #' + currentProduct.poiList[i].name);
            var htmlPos = toScreenPosition(currentProduct.poiList[i].object3d, camera);

            divObj.css ({position:'absolute',top:htmlPos.y,left:htmlPos.x});
            var intersects = raycast (htmlPos, false);
            if (intersects && intersects.length > 1) {
                if (intersects[1].object.parent.name == currentProduct.poiList[i].name) {
                    divObj.removeClass('behind');
                }
                else {

                    divObj.addClass('behind');
                }
            }
        }
    }
}
function renderScene() {
    stats.update();

    var delta = clock.getDelta();
    setmyViewDimensions (myView);
    camera = myView.camera;

    if (myView.controls) {
        myView.controls.update(delta);
    }
    camera.aspect = (myView.dimensions.x / myView.dimensions.y);
    camera.updateProjectionMatrix();

    myView.renderer.setSize(myView.dimensions.x, myView.dimensions.y);
    myView.renderer.render( scene, camera );



}

function initStats() {

    stats = new Stats();
    stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom

    stats.dom.id = 'stats'; // Align top-left
    return stats;
}

function setmyViewDimensions (myViewObj){
    myViewObj.dimensions.x = vpDiv.clientWidth;
    myViewObj.dimensions.y = vpDiv.clientHeight;
}

function onResize() {
    setmyViewDimensions (myView);
    //myView.renderer.setSize(myView.dimensions.x, myView.dimensions.y);
    myView.renderer.setSize(myView.dimensions.x, myView.dimensions.y);
}

function mousedown( ev ) {
    mouseDown = true;
    if(!startMousePos) {

        ev=ev||event;
        startMousePos={
            x: ev.clientX,
            y: ev.clientY
        };
    }

    myView.previousdrag.x = 0;
    myView.previousdrag.y = 0;


    var intersects =  raycast (event, true);

    if (intersects && intersects[0].object instanceof THREE.BoundingBoxHelper) {
        var productName = getproductNameNum(intersects[0].object.name);

        if ($('#' + productName.name + '_summary').hasClass("clicked") != true) {
            intersects[0].object.traverse(function (child) {
                if (child instanceof THREE.Mesh && !(child instanceof THREE.BoundingBoxHelper )) {
                    setHighlight(child, myView.click);
                }
            });
        }

    }
    else document.body.style.cursor = 'initial';

}
function mousemove( event ) {

    var intersects = raycast(event, true);

    if (intersects && intersects[0].object instanceof THREE.BoundingBoxHelper && noDrag()) { // if your mouse moves over a product
        var productName = getproductNameNum(intersects[0].object.name); // get the name of the product it rolled on to.

        if ($('#' + productName.name+'_summary').hasClass( "clicked" )!= true){
            intersects[0].object.traverse(function (child) {
                if (child instanceof THREE.Mesh && !(child instanceof THREE.BoundingBoxHelper )) {

                    setHighlight(child, myView.hover);
                    document.body.style.cursor = 'pointer';
                }
            });
        }

        if (productName.name != myView.rollOverProduct.name){
            console.log ('rolled on to: ' + productName.name);
            $('#' + productName.name + '_summary').addClass("rollover");
            $('#' + productName.name + '_title').addClass("rollover");
            if ($('#' + productName.name+'_summary').hasClass( "clicked" )!= true){
                $('#' + productName.name + '_summary').stop().fadeToggle(200, "linear" );
                $('#' + productName.name + '_title').stop().fadeToggle(200, "linear" );
            }
            if (myView.rollOverProduct.name != null){
                console.log ('rolled off from another: rolld off : ' + myView.rollOverProduct.name);
                var tempObj = scene.getObjectByName(myView.rollOverProduct.name);
                tempObj.traverse(function (child) {
                    if (child instanceof THREE.Mesh && !(child instanceof THREE.BoundingBoxHelper )) {
                        setHighlight(child, myView.normal);
                        document.body.style.cursor = 'default';
                    }
                });
                $('#' + myView.rollOverProduct.name + '_summary').removeClass("rollover");
                $('#' + myView.rollOverProduct.name + '_title').removeClass("rollover");
                if ($('#' + myView.rollOverProduct.name + '_summary').hasClass( "clicked" )!= true){
                    $('#' + myView.rollOverProduct.name + '_summary').stop().fadeToggle(200, "linear" );
                    $('#' + myView.rollOverProduct.name + '_title').stop().fadeToggle(200, "linear" );
                }
            }
            myView.rollOverProduct = productName; // set the roll on
        }
    }
    else { // youre not on anything
        if (myView.rollOverProduct.name != null) {
            console.log('you rolled off of: ' + myView.rollOverProduct.name);
            var tempObj = scene.getObjectByName(myView.rollOverProduct.name);
            tempObj.traverse(function (child) {
                if (child instanceof THREE.Mesh && !(child instanceof THREE.BoundingBoxHelper )) {
                    setHighlight(child, myView.normal);
                    document.body.style.cursor = 'default';
                }
            });
            $('#' + myView.rollOverProduct.name + '_summary').removeClass("rollover");
            $('#' + myView.rollOverProduct.name + '_title').removeClass("rollover");
            if ($('#' + myView.rollOverProduct.name+'_summary').hasClass( "clicked" )!= true){
                $('#' + myView.rollOverProduct.name + '_summary').stop().fadeToggle(200, "linear" );
                $('#' + myView.rollOverProduct.name + '_title').stop().fadeToggle(200, "linear" );
            }
        }

        myView.rollOverProduct = {name:null,num:null};
    }





    if (startMousePos) {

        mouseDrag = true;
        var drag = new THREE.Vector2(0, 0);
        drag.x = event.clientX - startMousePos.x;
        drag.y = event.clientY - startMousePos.y;

        myView.moveCamera(drag);


    }
}

function mouseup( e ) {
    console.log (myView.totalDrag);
    var intersects =  raycast (event, true);

    if (intersects && intersects[0].object instanceof THREE.BoundingBoxHelper)
    {
        console.log (intersects[0].object);
        intersects[0].object.traverse(function(child){
            if (child instanceof THREE.Mesh && !(child instanceof THREE.BoundingBoxHelper )) {
                setHighlight(child,myView.normal);
            }
        });
    }
    if (noDrag()) { // if the mouse wasnt previously dragged before left button was released
        var intersects = raycast(e, true);

        if (intersects && intersects[0].object instanceof THREE.BoundingBoxHelper) { // if you clicked on a product as detected by a bounding box

            var clickedNameNum = getproductNameNum(intersects[0].object.name);
            var mySceneProduct = myScene.products[clickedNameNum.num];

            myView.previousProduct = myView.currentProduct; // saves the
            myView.currentProduct = clickedNameNum; // current product that has been clicked on


            if (myView.level == 0) { // if youre at the scene start / look position
                $('.navigate').fadeToggle(200, "linear" );
                // camera will move to level one
                myView.setCamToOrbitControls(); // set the camera to an orbit view without it changing position

                myView.previousProduct = clickedNameNum;
                myView.currentProduct = clickedNameNum; // current product that has been clicked on
                myView.animateCam(mySceneProduct);


                $('#' + myView.currentProduct.name+'_summary').addClass( "clicked" );
                $('#' + myView.currentProduct.name+'_title').addClass( "clicked" );




                $('#' + mySceneProduct.name + '_pois').fadeToggle(200, "linear" );
                console.log ('#' + mySceneProduct.name);
            }

            if (myView.level == 1 ||  myView.level == 2) {

                var myScenePrevious = myScene.products[myView.previousProduct.num];

                if (myView.currentProduct.num != myView.previousProduct.num)
                {
                    $('.poi-summary').each(function( index ) {
                        if ($(this).hasClass('clicked')){
                            $(this).removeClass('clicked');
                            $(this).stop().fadeToggle(200, "linear");
                        }
                    });

                    myView.level = 1;
                    myView.animateCam(mySceneProduct);

                    $('#' + mySceneProduct.name + '_pois').fadeToggle(200, "linear" );
                    $('#' + myScenePrevious.name + '_pois').fadeToggle(200, "linear" );


                    $('#' + myView.currentProduct.name+'_summary').addClass( "clicked" );
                    $('#' + myView.currentProduct.name+'_title').addClass( "clicked" );
                    $('#' + myView.previousProduct.name+'_summary').removeClass( "clicked" );
                    $('#' + myView.previousProduct.name+'_title').removeClass( "clicked" );
                    $('#' + myView.previousProduct.name + '_summary').css({'display': 'none'});
                    $('#' + myView.previousProduct.name + '_title').css({'display': 'none'});



                }
            }

            if (myView.level != 2)
                myView.level = 1;
        }
    }
    startMousePos = null;
    mouseDrag = false;
    myView.deltaDrag.x = 0;
    myView.deltaDrag.y = 0;

    myView.totalDrag.x = 0;
    myView.totalDrag.y = 0;

}
function noDrag (){
    if ((myView.totalDrag.x > -5 && myView.totalDrag.x < 5)  && (myView.totalDrag.y > -5 && myView.totalDrag.y < 5))
        return true;
    else
        return false;
}
function getproductNameNum (bbObjName) {
    var productNameNum = {name:null,num:null};
    var str = bbObjName; // get the name from ther bounding box 'bbox_productName'
    var strSplit = str.split("_"); // split it and get the second part of the string
    productNameNum.name =  strSplit[1];
    productNameNum.num = myScene.productList.indexOf(productNameNum.name); // find out what the index of the object is in myScene
    return productNameNum;

}

function toScreenPosition(obj, camera)
{
    var vector = new THREE.Vector3();

    var widthHalf = 0.5*myView.dimensions.x;
    var heightHalf = 0.5*myView.dimensions.y;

    obj.updateMatrixWorld();
    vector.setFromMatrixPosition(obj.matrixWorld);
    vector.project(camera);

    vector.x = ( vector.x * widthHalf ) + widthHalf;
    vector.y = - ( vector.y * heightHalf ) + heightHalf;

    return {
        x: vector.x,
        y: vector.y
    };
}

function raycast (pos, fromMouse)
{
    var final = new THREE.Vector2();
    var offset = $("#vp0").offset();

    if (!fromMouse){
        offset.left = 0; offset.top = 0;
    }
    var isIE11 = !!window.MSInputMethodContext && !!document.documentMode;
    if (isIE11)
        offset.left = 0; // a nasty hack for ie11 mouse odffset does not need to be offset for some weird reason that I cant work out

    final.x = ( (pos.x - offset.left) / myView.dimensions.x ) * 2 - 1;
    final.y = -( (pos.y - offset.top) / myView.dimensions.y ) * 2 + 1;

    // update the picking ray with the camera and mouse position
    if (pos.x != null) {
        raycaster.setFromCamera(final, myView.camera);

        // calculate objects intersecting the picking ray
        var objArray = raycaster.intersectObjects(scene.children, true);

        if (objArray.length > 0)
            return objArray;
        else
            return false;
    }
}
function setHighlight (obj, color)
{

    if (obj.material instanceof THREE.MultiMaterial) {
        for (i = 0; i < obj.material.materials.length; i++) {
            obj.material.materials[i].emissive.r = color.r;
            obj.material.materials[i].emissive.g = color.g;
            obj.material.materials[i].emissive.b = color.b;
        }
    }
    else {
        obj.material.emissive.r = color.r;
        obj.material.emissive.g = color.g;
        obj.material.emissive.b = color.b;
    }
}
function setFromPoi(poiNum,product){
    myView.level = 2;
    var poi = myScene.products[myView.currentProduct.num].poiList[poiNum];
    myView.animateCam(poi);
}
function goBack(){
    $('.poi-summary').each(function( index ) {
        if ($(this).hasClass('clicked')){
            $(this).removeClass('clicked');
            $(this).stop().fadeToggle(200, "linear");
        }
    });
    switch (myView.level) {
        case 1:
            myView.level = 0;
            $('.navigate').fadeToggle(200, "linear" );
            myView.rollOverProduct = {name:null,num:null};
            $('#' + myView.currentProduct.name+'_summary').removeClass( "clicked" );
            $('#' + myView.currentProduct.name+'_title').removeClass( "clicked" );
            for (i=0; i < myScene.productList.length;i++){
                $('#' + myScene.productList[i]+'_summary').css ({'display': 'none'});
                $('#' + myScene.productList[i]+'_title').css ({'display': 'none'});
            }
            if ($('#techspecs').hasClass("width50")) {
                $("#techspecs-container").toggle('drop', {percent: 100, duration: 300, easing: 'linear'});
                $('#techspecs').toggleClass("width50").toggleClass("width0");
                $('.webglviewport').toggleClass("width100").toggleClass("width50");
            }




            myView.animateCam(myScene.products[0]  );

            var currentName = myScene.products[myView.currentProduct.num].name;
            $('#'+currentName+'_pois').fadeToggle(200, "linear" );

            break;
        case 2:
            myView.animateCam(myScene.products[myView.currentProduct.num]);
            myView.level = 1;

            break;
    }
}
function toggleSpecs() {
    $('#techspecs').toggleClass("width50").toggleClass("width0");
    $('.webglviewport').toggleClass("width100").toggleClass("width50");

    $( "#techspecs-container" ).toggle('slide',{percent: 100, duration:300,easing:'linear' });


}

$(document).ready (function() {
    $('#vp0').mouseenter(function() {
        console.log ('entered techspecs');
        myView.mouseInViewPort = true;
    });
    $('#vp0').mouseleave(function() {
        console.log ('left techspecs');
        myView.mouseInViewPort = false;
    });
    $('.poi').mouseenter(function() {
        var poiID = $(this).attr('id') // get the name from ther bounding box 'bbox_productName'
        var fullName = '#'+poiID+'-summary';
        $(fullName).addClass('rollover');
        if ($(fullName).hasClass( "clicked" )!= true) {
            $(fullName).stop().fadeToggle(200, "linear");
        }
    });
    $('.poi').mouseout(function() {
        var poiID = $(this).attr('id') // get the name from ther bounding box 'bbox_productName'
        var fullName = '#'+poiID+'-summary';
        $(fullName).removeClass('rollover');
        if ($(fullName).hasClass( "clicked" )!= true) {
            $(fullName).stop().fadeToggle(200, "linear");
        }
    });
    $('.poi').click(function() {
        var poiID = $(this).attr('id') // get the name from ther bounding box 'bbox_productName'
        var fullName = '#'+poiID+'-summary';
        if ($(fullName).hasClass('clicked') != true){
            $('.poi-summary').each(function (index) {
                if ($(this).hasClass('clicked')) {
                    $(this).removeClass('clicked');
                    $(this).stop().css({'display': 'none'});
                }
            });
            $(fullName).addClass('clicked');
        }
    });
});

window.addEventListener('resize', onResize, false);
window.addEventListener('mousedown',mousedown);
window.addEventListener('mousemove',mousemove);
window.addEventListener('mouseup',mouseup);

$(window).bind('mousewheel DOMMouseScroll', function(event){
    if (myView.mouseInViewPort == true){
        if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
            // scroll up
            myView.zoomCamera(-7);
        }
        else {
            // scroll down
            myView.zoomCamera(7);

        }
    }
});

