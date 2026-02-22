import { Loader } from "@mantine/core";
import { useFile } from "@betterbase/sdk/sync/react";
import type { Photo } from "@/lib/db";

interface LightboxSlideProps {
  photo: Photo;
}

export function LightboxSlide({ photo }: LightboxSlideProps) {
  const { url, status } = useFile(photo.fileId, photo.mimeType);

  if (status === "loading" || status === "idle") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}
      >
        <Loader color="white" />
      </div>
    );
  }

  if (!url) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          color: "white",
        }}
      >
        Photo unavailable
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={photo.filename}
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      }}
    />
  );
}
