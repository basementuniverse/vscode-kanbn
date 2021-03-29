import React from "react";

const Header = ({ name, description }: { name: string, description: string }) => {
  return (
    <div className="kanbn-header">
      <h1 className="kanbn-header-name">{name}</h1>
      <p className="kanbn-header-description">
        {description}
      </p>
    </div>
  );
}

export default Header;
