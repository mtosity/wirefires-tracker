import React, { useState, useEffect, useCallback } from "react";
import Map from "@/components/Map";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import InfoBox from "@/components/InfoBox";
import MapControls from "@/components/MapControls";
import ActionButtons from "@/components/ActionButtons";
import AlertBanner from "@/components/AlertBanner";
import FirePopup from "@/components/FirePopup";
import MobileBottomSheet from "@/components/MobileBottomSheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  useWildfires,
  useWildfireStats,
  useActiveAlerts,
  useNearbyWildfires,
} from "@/hooks/useWildfireData";
import { useMobile } from "@/hooks/use-mobile";
import { Wildfire, Alert, MapBounds, WildfireStats } from "@/types/wildfire";
import mapboxgl from "mapbox-gl";
import { useToast } from "@/hooks/use-toast";

const Home = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedWildfire, setSelectedWildfire] = useState<Wildfire | null>(
    null,
  );
  const [popupOpen, setPopupOpen] = useState(false);
  const [mobileBottomSheetOpen, setMobileBottomSheetOpen] = useState(false);
  const [activeView, setActiveView] = useState<"fires" | "map" | "airQuality">(
    "fires",
  );
  const [mapBounds, setMapBounds] = useState<MapBounds | undefined>(undefined);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [mapInstance, setMapInstance] = useState<any>(null);

  const { toast } = useToast();
  const isMobile = useMobile();
  const {
    position,
    error: geoError,
    loading: geoLoading,
    getPosition,
  } = useGeolocation();

  // Fetch wildfires data
  const { data: wildfiresData } = useWildfires(mapBounds);
  const { data: statsData } = useWildfireStats();
  const { data: alertsData } = useActiveAlerts(
    position?.latitude || null,
    position?.longitude || null,
  );
  const { data: nearbyData } = useNearbyWildfires(
    position?.latitude || null,
    position?.longitude || null,
  );

  const wildfires: Wildfire[] = wildfiresData?.wildfires || [];
  const stats: WildfireStats = statsData?.stats || {
    activeFiresCount: 0,
    totalAcresBurning: 0,
    nearbyFiresCount: 0,
  };
  const alerts: Alert[] = alertsData?.alerts || [];
  
  // Log for debugging
  useEffect(() => {
    if (position) {
      console.log('User position:', position);
      console.log('Alerts received:', alerts.length > 0 ? 'Yes' : 'No');
    }
  }, [position, alerts]);

  // Active alerts (filtered by dismissed)
  const activeAlerts = alerts.filter(
    (alert) => !dismissedAlerts.includes(alert.id),
  );

  useEffect(() => {
    if (geoError) {
      toast({
        title: "Location Error",
        description: geoError,
        variant: "destructive",
      });
    }
  }, [geoError, toast]);

  const handleWildfireSelect = useCallback(
    (wildfire: Wildfire | null) => {
      setSelectedWildfire(wildfire);

      if (wildfire) {
        setPopupOpen(true);
        if (isMobile) {
          setMobileBottomSheetOpen(true);
        }
      } else {
        setPopupOpen(false);
        setMobileBottomSheetOpen(false);
      }
    },
    [isMobile],
  );

  const handleMapMove = useCallback((bounds: mapboxgl.LngLatBounds) => {
    const newBounds: MapBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };
    setMapBounds(newBounds);
  }, []);

  const handleZoomIn = useCallback(() => {
    if (mapInstance) {
      mapInstance.zoomIn();
    }
  }, [mapInstance]);

  const handleZoomOut = useCallback(() => {
    if (mapInstance) {
      mapInstance.zoomOut();
    }
  }, [mapInstance]);

  const handleLocateMe = useCallback(() => {
    getPosition();

    if (position && mapInstance) {
      mapInstance.flyTo({
        center: [position.longitude, position.latitude],
        zoom: 10,
      });
    }
  }, [getPosition, position, mapInstance]);

  const handleGetDirections = useCallback(() => {
    if (selectedWildfire) {
      const { latitude, longitude, name } = selectedWildfire;
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${encodeURIComponent(name)}`,
        "_blank",
      );
    }
  }, [selectedWildfire]);

  const handleShareWildfire = useCallback(() => {
    if (selectedWildfire) {
      const shareText = `Check out the ${selectedWildfire.name} wildfire: ${window.location.origin}?fire=${selectedWildfire.id}`;

      if (navigator.share) {
        navigator
          .share({
            title: "FireTracker",
            text: shareText,
            url: window.location.href,
          })
          .catch((err) => {
            console.error("Share failed:", err);
            // Fallback - copy to clipboard
            navigator.clipboard.writeText(shareText);
            toast({
              title: "Link Copied",
              description: "Wildfire information copied to clipboard",
            });
          });
      } else {
        // Fallback - copy to clipboard
        navigator.clipboard.writeText(shareText);
        toast({
          title: "Link Copied",
          description: "Wildfire information copied to clipboard",
        });
      }
    }
  }, [selectedWildfire, toast]);

  const handleDismissAlert = useCallback((alertId: string) => {
    setDismissedAlerts((prev) => [...prev, alertId]);
  }, []);

  const handleSubscribeToAlerts = useCallback(() => {
    if (selectedWildfire) {
      toast({
        title: "Alert Subscription",
        description: `You'll be notified about updates to ${selectedWildfire.name}`,
      });
    }
  }, [selectedWildfire, toast]);
  
  // Check if a wildfire is active (not contained or 100% contained)
  const isActiveWildfire = useCallback((wildfire: Wildfire): boolean => {
    return wildfire.severity !== 'contained' && wildfire.containment < 100;
  }, []);
  
  const handleAlertClick = useCallback((alert: Alert) => {
    // Find the wildfire associated with this alert
    if (alert.wildfireId) {
      const relatedWildfire = wildfires.find(fire => fire.id === alert.wildfireId);
      
      if (relatedWildfire) {
        // Only select and zoom to the wildfire if it's active
        if (isActiveWildfire(relatedWildfire)) {
          // Select the wildfire
          handleWildfireSelect(relatedWildfire);
          
          // Zoom to the wildfire location
          if (mapInstance) {
            mapInstance.flyTo({
              center: [relatedWildfire.longitude, relatedWildfire.latitude],
              zoom: 12,
              essential: true
            });
          }
        } else {
          // Show a message that the wildfire is no longer active
          toast({
            title: "Wildfire Status",
            description: `${relatedWildfire.name} is no longer active (${relatedWildfire.containment}% contained)`,
          });
        }
      }
    }
  }, [wildfires, mapInstance, handleWildfireSelect, isActiveWildfire, toast]);

  return (
    <div className="h-screen w-full relative overflow-hidden">
      {/* Main Map */}
      <Map
        wildfires={wildfires}
        onMapMove={handleMapMove}
        onWildfireSelect={handleWildfireSelect}
        selectedWildfire={selectedWildfire}
        userLocation={position}
        onMapInit={setMapInstance}
      />

      {/* Header */}
      <Header title="FireTracker" />

      {/* Map Controls */}
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onLocateMe={handleLocateMe}
        isLocating={geoLoading}
      />

      {/* Info Box */}
      <InfoBox stats={stats} />

      {/* Map Controls */}
      <div className="absolute bottom-4 right-4 z-10 flex space-x-2">
        {/* Clear Selection Button - Only show when a wildfire is selected */}
        {selectedWildfire && (
          <Button
            className="map-overlay p-2 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-full shadow-md"
            onClick={() => setSelectedWildfire(null)}
            size="sm"
            variant="ghost"
            title="Clear selection"
          >
            <span className="material-icons text-sm">close</span>
          </Button>
        )}

        {/* Theme Toggle Button */}
        <div className="map-overlay rounded-full shadow-md">
          <ThemeToggle />
        </div>

        {/* Toggle Sidebar Button */}
        <Button
          className="map-overlay p-2 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-full shadow-md"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          size="sm"
          variant="ghost"
          title="Show wildfire list"
        >
          <span className="material-icons text-sm">format_list_bulleted</span>
        </Button>
      </div>

      {/* Sidebar */}
      <Sidebar
        wildfires={wildfires}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onWildfireSelect={handleWildfireSelect}
        selectedWildfire={selectedWildfire}
      />

      {/* Fire Popup */}
      {selectedWildfire && popupOpen && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <FirePopup
            wildfire={selectedWildfire}
            onClose={() => handleWildfireSelect(null)}
            onViewDetails={() => {
              if (isMobile) {
                setMobileBottomSheetOpen(true);
              }
            }}
            onGetDirections={handleGetDirections}
            onSubscribeToAlerts={handleSubscribeToAlerts}
          />
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      <MobileBottomSheet
        wildfire={selectedWildfire}
        isOpen={mobileBottomSheetOpen}
        onClose={() => {
          setMobileBottomSheetOpen(false);
          setSelectedWildfire(null);
        }}
        onGetDirections={handleGetDirections}
        onShare={handleShareWildfire}
      />

      {/* Alert Banner */}
      {activeAlerts.length > 0 && (
        <AlertBanner
          alert={activeAlerts[0]}
          onClose={() => handleDismissAlert(activeAlerts[0].id)}
          onAlertClick={() => handleAlertClick(activeAlerts[0])}
        />
      )}
    </div>
  );
};

export default Home;
